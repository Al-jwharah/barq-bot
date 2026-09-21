import { createHash } from "node:crypto";
import { isOwnerId, MAX_DOWNLOAD_SIZE_MB, TELEGRAM_CLOUD_MAX_MB } from "./config.server";

export const BURST_PER_MINUTE = 50;
export const BURST_TIMEOUT_SEC = 10 * 60;
export const DUP_WINDOW_SEC = 180;
export const QUEUE_MAX_PENDING = 80;

export type AbuseVerdict =
  | { ok: true }
  | { ok: false; code: "timeout" | "burst" | "duplicate" | "huge" | "queue"; retryAfter: number; message: string };

export function urlFingerprint(url: string): string {
  return createHash("sha256").update(url.trim()).digest("hex").slice(0, 24);
}

export function hugeFileMessage(): string {
  return `الملف أكبر من حد تليجرام (${TELEGRAM_CLOUD_MAX_MB}MB للسحابة / ${MAX_DOWNLOAD_SIZE_MB}MB للسحب). اختر جودة أقل.`;
}

export function burstMessage(retryAfter: number): string {
  return `إيقاف مؤقت ${Math.ceil(retryAfter / 60)} دقائق — طلبات كثيرة في دقيقة.\nالدعم @i_2169`;
}

export function duplicateMessage(): string {
  return "هذا الرابط طُلب للتو. انتظر ثواني أو افتح سجلي.";
}

export function queueFullMessage(): string {
  return "الطابور ممتلئ الآن. أعد المحاولة بعد قليل.";
}

export function timeoutMessage(retryAfter: number): string {
  return burstMessage(retryAfter);
}

async function sqlClient() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function ensure() {
  const sql = await sqlClient();
  await sql`
    create table if not exists user_timeouts (
      tg_id text primary key,
      until timestamptz not null,
      reason text not null,
      created_at timestamptz not null default now()
    )
  `;
}

export async function activeTimeout(tgId: number | string): Promise<number> {
  if (isOwnerId(tgId)) return 0;
  try {
    await ensure();
    const sql = await sqlClient();
    const rows = await sql<{ until: string }>`
      select until from user_timeouts
      where tg_id = ${String(tgId)} and until > now()
      limit 1
    `;
    const until = rows[0]?.until ? Date.parse(String(rows[0].until)) : 0;
    if (!until) return 0;
    return Math.max(1, Math.ceil((until - Date.now()) / 1000));
  } catch {
    return 0;
  }
}

export async function setTimeoutFor(tgId: number | string, seconds: number, reason: string): Promise<void> {
  if (isOwnerId(tgId)) return;
  try {
    await ensure();
    const sql = await sqlClient();
    await sql`
      insert into user_timeouts (tg_id, until, reason)
      values (${String(tgId)}, now() + (${seconds} * interval '1 second'), ${reason.slice(0, 80)})
      on conflict (tg_id) do update set until = excluded.until, reason = excluded.reason
    `;
  } catch {
    /* rate_limits still apply */
  }
}

export async function recentDuplicate(tgId: number | string, url: string): Promise<boolean> {
  if (isOwnerId(tgId)) return false;
  try {
    const sql = await sqlClient();
    const fp = urlFingerprint(url);
    const rows = await sql<{ c: number }>`
      select count(*)::int as c from download_jobs
      where tg_id = ${String(tgId)}
        and created_at > now() - (${DUP_WINDOW_SEC} * interval '1 second')
        and (
          url = ${url.slice(0, 500)}
          or md5(url) = md5(${url.slice(0, 500)})
        )
    `;
    void fp;
    return Number(rows[0]?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function guardDownload(_tgId: number | string, _url: string): Promise<AbuseVerdict> {
  return { ok: true };
}

export async function queueIsFull(pending: number): Promise<boolean> {
  return pending >= QUEUE_MAX_PENDING;
}
