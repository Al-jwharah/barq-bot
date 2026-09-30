/**
 * Always-on download worker entry (Fly / Railway / Docker).
 *
 * Usage:
 *   BARQ_WORKER_DRY_RUN=on npx tsx src/worker/main.ts   # claim only, no Telegram
 *   npx tsx src/worker/main.ts                          # full drainJobs loop
 *
 * Env (see WORKER.md): DATABASE_URL, BARQ_JOB_SECRET, TELEGRAM_BOT_TOKEN, …
 */
import { drainJobs, maxConcurrentJobs, processDownloadJob } from "../lib/jobs/worker.server";
import { reclaimStuckJobs } from "../lib/jobs/queue.server";
import { dryClaimOnce } from "./dry-claim";
import { workerDryRunEnabled, workerIdleMs, workerPort } from "./flags";
import { startWorkerHttp } from "./http";
import { WorkerLoop } from "./loop";

async function main() {
  const dry = workerDryRunEnabled();
  console.info(
    JSON.stringify({
      event: "worker.start",
      dryRun: dry,
      port: workerPort(),
      idleMs: workerIdleMs(),
      maxConcurrent: maxConcurrentJobs(),
      pid: process.pid,
    }),
  );

  const loop = new WorkerLoop({
    drain: async (max) => {
      await reclaimStuckJobs().catch(() => undefined);
      return drainJobs(max);
    },
    dryClaim: dry ? dryClaimOnce : undefined,
  });

  const server = startWorkerHttp({
    loop,
    processJob: dry
      ? undefined
      : async (id) => {
          await reclaimStuckJobs().catch(() => undefined);
          return processDownloadJob(id);
        },
    getStats: () => loop.stats,
  });

  const shutdown = async (signal: string) => {
    console.info(JSON.stringify({ event: "worker.shutdown", signal }));
    await loop.stop(25_000);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await loop.run();
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      event: "worker.fatal",
      error: err instanceof Error ? err.message : "fatal",
    }),
  );
  process.exit(1);
});
