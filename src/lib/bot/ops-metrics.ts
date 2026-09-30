/** Durable /api/status processed counter: completed + expired jobs (survives cold start). */
export function processedFromJobCounts(q: { completed?: number; expired?: number }): number {
  return Math.max(0, Number(q.completed ?? 0) + Number(q.expired ?? 0));
}

/**
 * BARQ_FAIL_RATE_ALERT: fraction 0–1 (default 0.35).
 * When last-hour download_jobs fail rate exceeds this, runOpsAlerts notifies owners.
 */
export function failRateAlertThreshold(envValue?: string | null): number {
  const raw = envValue ?? (typeof process !== "undefined" ? process.env.BARQ_FAIL_RATE_ALERT : undefined);
  if (raw == null || String(raw).trim() === "") return 0.35;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.35;
  if (n <= 0) return 0.35;
  if (n > 1) return Math.min(1, n / 100); // allow "35" meaning 35%
  return n;
}

export function shouldAlertHourlyFailRate(input: {
  failed: number;
  finished: number;
  threshold: number;
  minSamples?: number;
}): boolean {
  const failed = Math.max(0, Number(input.failed) || 0);
  const finished = Math.max(0, Number(input.finished) || 0);
  const minSamples = input.minSamples ?? 5;
  if (finished < minSamples) return false;
  const threshold = input.threshold;
  if (!(threshold > 0) || !Number.isFinite(threshold)) return false;
  return failed / finished >= threshold;
}
