import {
  ADMIN_LOCK_MINUTES,
  ADMIN_MAX_LOGIN_ATTEMPTS,
  RATE_LINKS_PER_HOUR,
  RATE_PER_MINUTE,
  isOwnerId,
} from "./config.server";

export type RateKind = "webhook" | "msg" | "link" | "download" | "burst" | "ai" | "login" | "clip";
export type RateResult = {
  ok: boolean;
  retryAfter: number;
  reason?: string;
  count?: number;
  degraded?: boolean;
};

type Bucket = { count: number; resetAt: number };
const mem = new Map<string, Bucket>();

function takeMem(key: string, max: number, windowMs: number, now: number): RateResult {
  const cur = mem.get(key);
  if (!cur || cur.resetAt <= now) {
    mem.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0, count: 1 };
  }
  if (cur.count >= max) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)), reason: key.split(":")[0] };
  }
  cur.count += 1;
  return { ok: true, retryAfter: 0, count: cur.count };
}

const WINDOW: Record<RateKind, { max: number; ms: number }> = {
  webhook: { max: 240, ms: 60_000 },
  msg: { max: RATE_PER_MINUTE, ms: 60_000 },
  link: { max: RATE_LINKS_PER_HOUR, ms: 60 * 60_000 },
  download: { max: RATE_LINKS_PER_HOUR, ms: 60 * 60_000 },
  burst: { max: 50, ms: 60_000 },
  ai: { max: RATE_PER_MINUTE, ms: 60_000 },
  login: { max: ADMIN_MAX_LOGIN_ATTEMPTS, ms: ADMIN_LOCK_MINUTES * 60_000 },
  clip: { max: 30, ms: 60_000 },
};

export const RATE_WINDOWS = {
  msgsPerMinute: RATE_PER_MINUTE,
  linksPerHour: RATE_LINKS_PER_HOUR,
  adminTries: ADMIN_MAX_LOGIN_ATTEMPTS,
  adminLockMinutes: ADMIN_LOCK_MINUTES,
} as const;

function retrySec(resetAt: Date | string | number, now: number): number {
  const t = resetAt instanceof Date ? resetAt.getTime() : Date.parse(String(resetAt));
  if (!Number.isFinite(t)) return 1;
  return Math.max(1, Math.ceil((t - now) / 1000));
}

/** Production / managed Postgres: never trust an in-memory counter. */
export function isRateLimitStrict(
  env: { NODE_ENV?: string; BARQ_REQUIRE_POSTGRES?: string } = typeof process === "undefined" ? {} : process.env,
): boolean {
  if ((env.NODE_ENV ?? "").toLowerCase() === "production") return true;
  const v = (env.BARQ_REQUIRE_POSTGRES ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "on";
}

export function degradedRateResult(kind: RateKind): RateResult {
  const win = WINDOW[kind];
  if (kind === "login") {
    return {
      ok: false,
      retryAfter: Math.ceil(win.ms / 1000),
      reason: "degraded",
      degraded: true,
      count: win.max,
    };
  }
  return { ok: true, retryAfter: 0, reason: "degraded", degraded: true, count: 0 };
}

export async function takeRate(key: string, kind: RateKind, now = Date.now()): Promise<RateResult> {
  const win = WINDOW[kind];
  const resetIso = new Date(now + win.ms).toISOString();
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql.query<{ count: number; reset_at: string }>(
      `insert into rate_limits (key, count, reset_at)
       values ($1, 1, $2::timestamptz)
       on conflict (key) do update
         set count = case
           when rate_limits.reset_at <= now() then 1
           else rate_limits.count + 1
         end,
         reset_at = case
           when rate_limits.reset_at <= now() then excluded.reset_at
           else rate_limits.reset_at
         end
       where rate_limits.reset_at <= now() or rate_limits.count < $3
       returning count, reset_at`,
      [key, resetIso, win.max],
    );
    if (rows[0]) return { ok: true, retryAfter: 0, count: Number(rows[0].count) };
    const cur = await sql<{ count: number; reset_at: string }>`
      select count, reset_at from rate_limits where key = ${key} limit 1
    `;
    const row = cur[0];
    return {
      ok: false,
      retryAfter: row ? retrySec(row.reset_at, now) : Math.ceil(win.ms / 1000),
      reason: kind,
      count: Number(row?.count ?? win.max),
    };
  } catch {
    if (isRateLimitStrict()) return degradedRateResult(kind);
    return takeMem(key, win.max, win.ms, now);
  }
}

export async function rateLimitUser(
  tgId: number | string,
  kind: "msg" | "link" = "link",
): Promise<RateResult> {
  if (isOwnerId(tgId)) return { ok: true, retryAfter: 0 };
  const id = String(tgId);
  if (kind === "msg") return takeRate(`msg:${id}`, "msg");
  const minute = await takeRate(`msg:${id}`, "msg");
  if (!minute.ok) return { ...minute, reason: minute.degraded ? "degraded" : "minute" };
  if (minute.degraded) return minute;
  const hour = await takeRate(`link:${id}`, "link");
  if (!hour.ok) return { ...hour, reason: hour.degraded ? "degraded" : "hour" };
  if (hour.degraded) return hour;
  return { ok: true, retryAfter: 0 };
}

export async function rateLimitWebhook(ip = "tg"): Promise<RateResult> {
  return takeRate(`webhook:${ip}`, "webhook");
}

export async function rateLimitClip(ip: string): Promise<RateResult> {
  return takeRate(`clip:${ip.slice(0, 64)}`, "clip");
}

export async function rateLimitLogin(key: string): Promise<RateResult> {
  return takeRate(`login:${key}`, "login");
}

export async function rateLimitAi(tgId: number | string): Promise<RateResult> {
  if (isOwnerId(tgId)) return { ok: true, retryAfter: 0 };
  return takeRate(`ai:${String(tgId)}`, "ai");
}
