import { BARQ_TIMEZONE } from "./config.server";

export const RIYADH_TZ = BARQ_TIMEZONE;

export function riyadhDay(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RIYADH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

/** First millisecond of the next Asia/Riyadh calendar day. */
export function riyadhTomorrowMs(now = Date.now()): number {
  const day = riyadhDay(now);
  const parts = day.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const noonUtc = Date.UTC(y, m - 1, d, 12, 0, 0);
  const label = riyadhDay(noonUtc);
  const startGuess = noonUtc - 12 * 3600_000;
  for (let i = 0; i < 48 * 60; i += 1) {
    const t = startGuess + i * 60_000;
    if (riyadhDay(t) !== label) return t;
  }
  return now + 24 * 3600_000;
}

export function secondsUntilRiyadhTomorrow(now = Date.now()): number {
  return Math.max(1, Math.ceil((riyadhTomorrowMs(now) - now) / 1000));
}
