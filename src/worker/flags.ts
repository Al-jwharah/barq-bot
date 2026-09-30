/**
 * Always-on external worker cutover flags.
 * Owner sets these in Vercel / Fly — agents do not mutate deploy secrets.
 */

export function externalWorkerEnabled(): boolean {
  const v =
    (typeof process !== "undefined" ? process.env.BARQ_EXTERNAL_WORKER : "")?.trim().toLowerCase() ??
    "";
  return v === "on" || v === "1" || v === "true";
}

/**
 * Full wake URL for Vercel → worker POST (e.g. https://barq-worker.fly.dev/wake).
 * Empty means external worker is polling only (kick is a no-op drain).
 */
export function workerWakeUrl(): string {
  return (typeof process !== "undefined" ? process.env.WORKER_WAKE_URL : "")?.trim() ?? "";
}

export function workerDryRunEnabled(): boolean {
  const v =
    (typeof process !== "undefined" ? process.env.BARQ_WORKER_DRY_RUN : "")?.trim().toLowerCase() ??
    "";
  return v === "on" || v === "1" || v === "true";
}

/** Idle poll when queue empty (ms). Default 1500. */
export function workerIdleMs(): number {
  const n = Number(typeof process !== "undefined" ? process.env.WORKER_IDLE_MS : NaN);
  return Number.isFinite(n) && n >= 200 ? Math.min(60_000, Math.trunc(n)) : 1_500;
}

/** Health HTTP port. Default 8080 (Fly). */
export function workerPort(): number {
  const n = Number(
    typeof process !== "undefined" ? (process.env.PORT ?? process.env.WORKER_PORT) : NaN,
  );
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 8080;
}
