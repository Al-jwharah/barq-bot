import { FILE_RETENTION_DAYS, LOG_RETENTION_DAYS, TEMP_FILE_RETENTION_HOURS } from "./config.server";

export type CohortUser = { created: string; lastSeen: string | null };

export const FILE_KEEP_DAYS = FILE_RETENTION_DAYS;
export const TEMP_KEEP_HOURS = TEMP_FILE_RETENTION_HOURS;
export const LOG_KEEP_DAYS = LOG_RETENTION_DAYS;

function day(iso: string): string {
  return iso.slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${day(from)}T00:00:00Z`);
  const b = Date.parse(`${day(to)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export function retentionRates(users: CohortUser[], today: string) {
  const d1Eligible = users.filter((u) => daysBetween(u.created, today) >= 1);
  const d1Kept = d1Eligible.filter((u) => u.lastSeen && daysBetween(u.created, u.lastSeen) >= 1);
  const d7Eligible = users.filter((u) => daysBetween(u.created, today) >= 7);
  const d7Kept = d7Eligible.filter((u) => u.lastSeen && daysBetween(u.created, u.lastSeen) >= 7);
  const d30Eligible = users.filter((u) => daysBetween(u.created, today) >= 30);
  const d30Kept = d30Eligible.filter((u) => u.lastSeen && daysBetween(u.created, u.lastSeen) >= 30);
  return {
    d1: pct(d1Kept.length, d1Eligible.length),
    d1n: d1Eligible.length,
    d7: pct(d7Kept.length, d7Eligible.length),
    d7n: d7Eligible.length,
    d30: pct(d30Kept.length, d30Eligible.length),
    d30n: d30Eligible.length,
  };
}

export function fileExpiredAt(createdMs: number, now = Date.now(), days = FILE_KEEP_DAYS): boolean {
  return now - createdMs >= days * 86_400_000;
}

export function tempExpiredAt(createdMs: number, now = Date.now(), hours = TEMP_KEEP_HOURS): boolean {
  return now - createdMs >= hours * 3_600_000;
}

export function logExpiredAt(createdMs: number, now = Date.now(), days = LOG_KEEP_DAYS): boolean {
  return now - createdMs >= days * 86_400_000;
}
