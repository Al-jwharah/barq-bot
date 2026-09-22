import { createFileRoute } from "@tanstack/react-router";
import { jobSecret } from "@/lib/bot/config.server";
import { authorizeJobRequest } from "@/lib/bot/job-auth";
import { attachWaitUntil, drainJobs, processDownloadJob } from "@/lib/jobs/worker.server";
import { jobStats, reclaimStuckJobs } from "@/lib/jobs/queue.server";
import { flushDb, isDbOverloadError } from "@/lib/db";
import { internalOrigin } from "@/lib/bot/origin";
import { externalWorkerEnabled } from "@/worker/flags";
import { kickOrWakeExternal } from "@/worker/wake";

/**
 * Queue reliability on Hobby:
 * - vercel.json /api/keep cron is daily-only (Hobby forbids sub-daily schedules).
 * - After each drain, if pending remains, self-kick /api/jobs so deep queues empty.
 * - Dedicated always-on worker is still recommended; this is a serverless stopgap.
 *
 * Kick-storm guards (load harness saw HTTP 500 under parallel reclaim+drain):
 * - Per-request drain budget ~5 (env JOBS_DRAIN_BUDGET) — snappy single-user, mild under load.
 * - Self-kick: at most one follow-up (depth cap), short delay + jitter (first-user latency).
 * - reclaimStuckJobs only on root kicks (depth 0); self-kicks drain only.
 * - DB pool / connection errors → 503 + Retry-After (clients back off).
 */
const MAX_SELF_KICK_DEPTH = 1;
/** Default 5 for snappy path; override via JOBS_DRAIN_BUDGET (1–8). */
function jobsDrainBudget(): number {
  const raw = process.env.JOBS_DRAIN_BUDGET;
  if (raw != null && String(raw).trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) return Math.min(8, Math.trunc(n));
  }
  return 5;
}
const JOBS_DRAIN_BUDGET = jobsDrainBudget();
/** Prefer first-user latency: kick soon if pending remains after drain. */
const SELF_KICK_BASE_DELAY_MS = 120;
const SELF_KICK_JITTER_MS = 80;
const OVERLOAD_RETRY_AFTER_SEC = 5;

function kickDepthFrom(request: Request): number {
  const raw = request.headers.get("x-barq-kick-depth") ?? "0";
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(64, Math.trunc(n)) : 0;
}

function overloadResponse() {
  return Response.json(
    { ok: false, error: "overload" },
    {
      status: 503,
      headers: { "Retry-After": String(OVERLOAD_RETRY_AFTER_SEC) },
    },
  );
}

function selfKickIfPending(pending: number, depth: number) {
  if (!(pending > 0)) return;
  if (depth >= MAX_SELF_KICK_DEPTH) return;
  const secret = jobSecret();
  const origin = internalOrigin();
  if (!origin || !secret) {
    void drainJobs(JOBS_DRAIN_BUDGET);
    return;
  }
  const delay = SELF_KICK_BASE_DELAY_MS + Math.floor(Math.random() * (SELF_KICK_JITTER_MS + 1));
  const remote = (async () => {
    await new Promise((r) => setTimeout(r, delay));
    await fetch(`${origin}/api/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-barq-job": secret,
        "x-barq-kick-depth": String(depth + 1),
      },
      body: JSON.stringify({ secret }),
    }).catch(() => undefined);
  })();
  // Same-request: keep draining in-process for first-user latency while remote kick covers depth.
  if (attachWaitUntil(remote)) {
    void drainJobs(Math.min(2, JOBS_DRAIN_BUDGET));
  } else {
    void drainJobs(JOBS_DRAIN_BUDGET);
  }
}

/**
 * Root kicks (depth 0): reclaim then drain.
 * Self-kicks: drain only — reclaim is cooldown-guarded and already ran on the root.
 */
async function reclaimThenDrain(max = JOBS_DRAIN_BUDGET, depth = 0) {
  if (depth === 0) {
    await reclaimStuckJobs().catch(() => undefined);
  }
  return drainJobs(max);
}


/** When external worker is on: reclaim (root only) + wake; no heavy drain on Vercel. */
async function externalWakeOnly(depth: number, jobId?: string) {
  if (depth === 0) {
    await reclaimStuckJobs().catch(() => undefined);
  }
  const mode = await kickOrWakeExternal(jobId);
  const after = await jobStats().catch(() => null);
  return { mode, queue: after };
}

export const Route = createFileRoute("/api/jobs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorizeJobRequest(request)) {
          // Public ping only — never leak pending/failed/avg.
          return Response.json({ ok: true });
        }
        try {
          const depth = kickDepthFrom(request);
          if (externalWorkerEnabled()) {
            const light = await externalWakeOnly(depth);
            await flushDb().catch(() => undefined);
            return Response.json({ ok: true, external: true, ...light });
          }
          const stats = await jobStats().catch(() => null);
          const drained = await reclaimThenDrain(JOBS_DRAIN_BUDGET, depth);
          await flushDb().catch(() => undefined);
          const after = await jobStats().catch(() => null);
          selfKickIfPending(after?.pending ?? 0, depth);
          return Response.json({ ok: true, queue: after ?? stats, drained });
        } catch (err) {
          if (isDbOverloadError(err)) return overloadResponse();
          throw err;
        }
      },
      POST: async ({ request }) => {
        let body: { id?: string; secret?: string } = {};
        try {
          body = (await request.json()) as { id?: string; secret?: string };
        } catch {
          body = {};
        }
        if (!authorizeJobRequest(request, body.secret)) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        try {
          const depth = kickDepthFrom(request);
          if (externalWorkerEnabled()) {
            const light = await externalWakeOnly(depth, body.id);
            await flushDb().catch(() => undefined);
            return Response.json({ ok: true, external: true, result: light, queue: light.queue });
          }
          const result = body.id
            ? await processDownloadJob(body.id)
            : await reclaimThenDrain(JOBS_DRAIN_BUDGET, depth);
          await flushDb().catch(() => undefined);
          const after = await jobStats().catch(() => null);
          selfKickIfPending(after?.pending ?? 0, depth);
          return Response.json({ ok: true, result, queue: after });
        } catch (err) {
          if (isDbOverloadError(err)) return overloadResponse();
          throw err;
        }
      },
    },
  },
});
