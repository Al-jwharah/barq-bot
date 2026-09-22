import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@vercel/functions";
import { OWNER_TG_ID, TELEGRAM_BOT_TOKEN } from "@/lib/bot/config.server";
import { authorizeJobRequest, legacyKeepProbeSecret } from "@/lib/bot/job-auth";
import { grokReady } from "@/lib/bot/grok.server";
import { telegram } from "@/lib/bot/telegram.server";
import { setSetting } from "@/lib/bot/store.server";
import { botHealth } from "@/lib/bot/webhook.server";
import { drainJobs } from "@/lib/jobs/worker.server";
import { flushDb } from "@/lib/db";
import { initSentry } from "@/lib/bot/sentry.server";

function later(task: Promise<unknown>) {
  try {
    waitUntil(task);
  } catch {
    void task;
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probePauseSend() {
  await setSetting("bot_paused", "on");
  await telegram.sendMessage(
    Number(OWNER_TG_ID),
    "اختبار Vercel: البوت توقف لحظيًا.\nالتوكن موجود. جروك " +
      (grokReady() ? "جاهز" : "غير جاهز") +
      ".",
  );
  await setSetting("bot_paused", "off");
  await telegram.sendMessage(
    Number(OWNER_TG_ID),
    `عاد يعمل على Vercel ⚡️\nجروك: ${grokReady() ? "يعمل" : "لا"}\nالتوكن: ${TELEGRAM_BOT_TOKEN ? "مضبوط" : "ناقص"}`,
  );
  await flushDb().catch(() => undefined);
  return { probe: "ok", grok: grokReady(), token: Boolean(TELEGRAM_BOT_TOKEN), paused: false };
}

/** Keep backstop: reclaim then drain up to 8 (matches jobs route ceiling). Hobby cron is daily-only. */
const KEEP_DRAIN_BUDGET = 8;
const KEEP_DRAIN_TIMEOUT_MS = 28_000;


/** Hobby: daily keep is not enough — kick /api/jobs so self-kick chain drains backlog. */
async function kickJobsIfPending() {
  const { jobStats } = await import("@/lib/jobs/queue.server");
  const after = await jobStats().catch(() => null);
  if (!(after && after.pending > 0)) return;
  const { kickJobWorker } = await import("@/lib/jobs/queue.server");
  await kickJobWorker().catch(() => undefined);
}

async function tick() {
  initSentry();
  const { reclaimStuckJobs } = await import("@/lib/jobs/queue.server");
  await reclaimStuckJobs().catch(() => undefined);
  const { externalWorkerEnabled } = await import("@/worker/flags");
  let jobs: unknown;
  if (externalWorkerEnabled()) {
    // Heavy extract lives on the always-on worker — keep only reclaims + wakes.
    await kickJobsIfPending().catch(() => undefined);
    jobs = { external: true, drained: "wake" };
  } else {
    jobs = await withTimeout(
      drainJobs(KEEP_DRAIN_BUDGET).catch((err) => ({ error: err instanceof Error ? err.message : "jobs" })),
      KEEP_DRAIN_TIMEOUT_MS,
      { error: "timeout" } as { error: string },
    );
    await kickJobsIfPending().catch(() => undefined);
  }
  later(
    (async () => {
      const { expireCompletedJobs } = await import("@/lib/jobs/queue.server");
      const { expireOldClips } = await import("@/lib/bot/store.server");
      const { runCleanup } = await import("@/lib/bot/cleanup.server");
      const { runHourlyAds } = await import("@/lib/bot/ads.server");
      const { runOpsAlerts } = await import("@/lib/bot/ops.server");
      const { runComebacks } = await import("@/lib/bot/growth.server");
      const { pollLiveFollows } = await import("@/lib/bot/live.server");
      const { runDailyBackup } = await import("@/lib/bot/backup-cron.server");
      await expireCompletedJobs().catch(() => undefined);
      await expireOldClips().catch(() => undefined);
      await runCleanup().catch(() => undefined);
      await runHourlyAds().catch(() => undefined);
      await runOpsAlerts().catch(() => undefined);
      await runComebacks().catch(() => undefined);
      const { cleanupFileCache } = await import("@/lib/bot/file-cache.server");
      await pollLiveFollows().catch(() => undefined);
      await runDailyBackup().catch(() => undefined);
      await cleanupFileCache().catch(() => undefined);
      await flushDb().catch(() => undefined);
    })(),
  );
  const health = await botHealth().catch((err) => ({
    running: false,
    lastError: err instanceof Error ? err.message : "health",
  }));
  return { ...health, jobs };
}

/** Minimal public response — no username/members/webhook/jobs dump. */
function publicOk() {
  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/keep")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const probeParam = url.searchParams.get("probe") ?? "";
        const legacyProbe = legacyKeepProbeSecret(request);
        const authed = authorizeJobRequest(request) || legacyProbe;
        if (!authed) return publicOk();

        // Legacy: ?probe=<jobSecret> OR authenticated ?probe=1
        if (legacyProbe || probeParam === "1") {
          const result = await probePauseSend();
          return Response.json(result);
        }
        return Response.json(await tick());
      },
      POST: async ({ request }) => {
        let bodySecret: string | undefined;
        try {
          const body = (await request.json()) as { secret?: unknown };
          if (typeof body?.secret === "string") bodySecret = body.secret;
        } catch {
          bodySecret = undefined;
        }
        if (!authorizeJobRequest(request, bodySecret)) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        return Response.json(await tick());
      },
    },
  },
});
