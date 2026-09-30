/**
 * Dry-run claim: exercises claimNextJob / finishJob without Telegram or extract.
 * Set BARQ_WORKER_DRY_RUN=on. Safe for local smoke; do not use in production cutover.
 */
import { claimNextJob, finishJob, markJobUploading } from "../lib/jobs/queue.server";

export async function dryClaimOnce(): Promise<{ id?: string; status: string }> {
  const job = await claimNextJob();
  if (!job) return { status: "empty" };
  // Real path is processing → uploading → completed.
  await markJobUploading(job.id).catch(() => undefined);
  const ok = await finishJob(job.id, "completed");
  if (!ok) {
    await finishJob(job.id, "failed", "dry-run").catch(() => undefined);
    return { id: job.id, status: "failed" };
  }
  return { id: job.id, status: "completed" };
}
