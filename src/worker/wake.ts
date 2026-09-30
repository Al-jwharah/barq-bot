import { jobSecret } from "../lib/bot/config.server";
import { externalWorkerEnabled, workerWakeUrl } from "./flags";

/**
 * Light wake: tell the always-on worker to drain soon.
 * Uses BARQ_JOB_SECRET via x-barq-job (same as /api/jobs).
 * Does not run extract/yt-dlp on the caller.
 */
export async function wakeExternalWorker(jobId?: string): Promise<boolean> {
  const url = workerWakeUrl();
  if (!url) return false;
  const secret = jobSecret();
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-barq-job": secret,
        },
        body: JSON.stringify({ id: jobId, secret }),
        signal: ac.signal,
      });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

/**
 * When BARQ_EXTERNAL_WORKER is on: wake remote worker (or no-op if polling-only).
 * Never falls back to in-process drain — that would keep heavy work on Vercel.
 */
export async function kickOrWakeExternal(jobId?: string): Promise<"woke" | "poll" | "off"> {
  if (!externalWorkerEnabled()) return "off";
  if (!workerWakeUrl()) return "poll";
  const ok = await wakeExternalWorker(jobId);
  return ok ? "woke" : "poll";
}
