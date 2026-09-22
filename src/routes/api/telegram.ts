import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@vercel/functions";
import { flushDb } from "@/lib/db";
import { handleUpdate } from "@/lib/bot/handle.server";
import { guardTelegramRequest } from "@/lib/bot/webhook-guard";

function later(task: Promise<unknown>): Promise<unknown> {
  try {
    waitUntil(task);
  } catch {
    /* @vercel/functions throws only on a non-Promise */
  }
  const ctx = (
    globalThis as unknown as Record<PropertyKey, { get?: () => { waitUntil?: (p: Promise<unknown>) => unknown } }>
  )[Symbol.for("@vercel/request-context")]?.get?.();
  if (typeof ctx?.waitUntil === "function") return Promise.resolve();
  // No Vercel request context: waitUntil is a silent no-op. Await so drain runs.
  return task;
}

function methodNotAllowed() {
  return new Response("method not allowed", { status: 405 });
}

export const Route = createFileRoute("/api/telegram")({
  server: {
    handlers: {
      GET: methodNotAllowed,
      HEAD: methodNotAllowed,
      PUT: methodNotAllowed,
      PATCH: methodNotAllowed,
      DELETE: methodNotAllowed,
      OPTIONS: methodNotAllowed,
      POST: async ({ request }) => {
        const raw = await request.text();
        const guarded = guardTelegramRequest(request, raw);
        if (!guarded.ok) {
          return new Response(guarded.body, { status: guarded.status });
        }
        // Await enqueue so a missing waitUntil context cannot drop the update.
        // Then drain: waitUntil when the Vercel context exists, otherwise await.
        await handleUpdate(guarded.update).catch(() => undefined);
        // Hobby cron for /api/keep is daily-only. Drain first for snappy single-user path,
        // then reclaim (cooldown-guarded) so stuck rows do not block the new job.
        // Deep queues continue via /api/jobs self-kick.
        // Dedicated always-on worker still recommended for launch.
        await later(
          (async () => {
            const { drainJobs } = await import("@/lib/jobs/worker.server");
            await drainJobs(3);
            const { reclaimStuckJobs, jobStats, kickJobWorker } = await import("@/lib/jobs/queue.server");
            await reclaimStuckJobs().catch(() => undefined);
            const stats = await jobStats().catch(() => null);
            if (stats && stats.pending > 0) {
              await kickJobWorker().catch(() => undefined);
            }
          })().finally(() => flushDb().catch(() => undefined)),
        );
        return new Response("ok");
      },
    },
  },
});
