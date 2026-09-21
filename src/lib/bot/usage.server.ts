import type { Sql } from "@/lib/db";
import { BARQ_AI_DAILY, DAILY_CAP } from "./config.server";
import { riyadhDay, secondsUntilRiyadhTomorrow } from "./clock";

export type UsageAction = "download" | "ai" | "clip" | "msg";

export type UsageTake = {
  ok: boolean;
  count: number;
  remaining: number;
  retryAfter: number;
  degraded?: boolean;
};

const usageMem = new Map<string, number>();

function memKey(userId: string, action: string, day: string): string {
  return `${userId}|${day}|${action}`;
}

function isUsageStrict(): boolean {
  if (typeof process === "undefined") return false;
  if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") return true;
  const v = (process.env.BARQ_REQUIRE_POSTGRES ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "on";
}

function takeUsageMem(
  userId: string,
  action: UsageAction,
  max: number,
  day: string,
  now: number,
): UsageTake {
  const k = memKey(userId, action, day);
  const cur = usageMem.get(k) ?? 0;
  if (cur >= max) {
    return { ok: false, count: cur, remaining: 0, retryAfter: secondsUntilRiyadhTomorrow(now) };
  }
  const count = cur + 1;
  usageMem.set(k, count);
  return { ok: true, count, remaining: Math.max(0, max - count), retryAfter: 0 };
}

function countUsageMem(userId: string, action: UsageAction, day: string): number {
  return usageMem.get(memKey(userId, action, day)) ?? 0;
}

function refundUsageMem(userId: string, action: UsageAction, day: string): number {
  const k = memKey(userId, action, day);
  const next = Math.max(0, (usageMem.get(k) ?? 0) - 1);
  usageMem.set(k, next);
  return next;
}

function degradedDeny(now: number): UsageTake {
  return {
    ok: false,
    count: 0,
    remaining: 0,
    retryAfter: secondsUntilRiyadhTomorrow(now),
    degraded: true,
  };
}

async function sqlOr(tx?: Sql): Promise<Sql> {
  if (tx) return tx;
  const { getSql } = await import("@/lib/db");
  return getSql();
}

export async function usageCount(
  userId: number | string,
  action: UsageAction,
  tx?: Sql,
  now = Date.now(),
): Promise<number> {
  const day = riyadhDay(now);
  const id = String(userId);
  try {
    const sql = await sqlOr(tx);
    const rows = await sql<{ count: number }>`
      select count from usage_counters
      where user_id = ${id} and day = ${day}::date and action = ${action}
    `;
    return Number(rows[0]?.count ?? 0);
  } catch (err) {
    if (tx) throw err;
    if (isUsageStrict()) return 0;
    return countUsageMem(id, action, day);
  }
}

export async function takeUsage(
  userId: number | string,
  action: UsageAction,
  max: number,
  tx?: Sql,
  now = Date.now(),
): Promise<UsageTake> {
  if (max < 0) return { ok: true, count: 0, remaining: -1, retryAfter: 0 };
  const day = riyadhDay(now);
  const id = String(userId);
  try {
    const sql = await sqlOr(tx);
    const rows = await sql.query<{ count: number }>(
      `insert into usage_counters (user_id, day, action, count)
       values ($1, $2::date, $3, 1)
       on conflict (user_id, day, action) do update
         set count = usage_counters.count + 1,
             updated_at = now()
       where usage_counters.count < $4
       returning count`,
      [id, day, action, max],
    );
    if (rows[0]) {
      const count = Number(rows[0].count);
      return { ok: true, count, remaining: Math.max(0, max - count), retryAfter: 0 };
    }
    const cur = await usageCount(userId, action, sql, now);
    return {
      ok: false,
      count: cur,
      remaining: 0,
      retryAfter: secondsUntilRiyadhTomorrow(now),
    };
  } catch (err) {
    if (tx) throw err;
    if (isUsageStrict()) return degradedDeny(now);
    return takeUsageMem(id, action, max, day, now);
  }
}

export async function refundUsage(
  userId: number | string,
  action: UsageAction,
  tx?: Sql,
  now = Date.now(),
): Promise<number> {
  const day = riyadhDay(now);
  const id = String(userId);
  try {
    const sql = await sqlOr(tx);
    const rows = await sql<{ count: number }>`
      update usage_counters
      set count = greatest(count - 1, 0), updated_at = now()
      where user_id = ${id} and day = ${day}::date and action = ${action}
      returning count
    `;
    return Number(rows[0]?.count ?? 0);
  } catch (err) {
    if (tx) throw err;
    if (isUsageStrict()) return 0;
    return refundUsageMem(id, action, day);
  }
}

export async function takeDailyDownload(
  userId: number | string,
  tx?: Sql,
  now = Date.now(),
): Promise<UsageTake> {
  return takeUsage(userId, "download", DAILY_CAP, tx, now);
}

export async function takeDailyAi(
  userId: number | string,
  tx?: Sql,
  now = Date.now(),
): Promise<UsageTake> {
  return takeUsage(userId, "ai", BARQ_AI_DAILY, tx, now);
}

export const DAILY_DOWNLOAD_CAP = DAILY_CAP;
export const DAILY_AI_CAP = BARQ_AI_DAILY;
