import type { Sql } from "@/lib/db";
import type { TgUpdate } from "./telegram.server";

export type TelegramUpdateStatus = "received" | "processed" | "failed";
export type ReceiveKind = "new" | "duplicate" | "retry";

const STALE_MS = 2 * 60 * 1000;

export function updateTypeOf(update: TgUpdate): string {
  if (update.message) return "message";
  if (update.callback_query) return "callback_query";
  if (update.pre_checkout_query) return "pre_checkout_query";
  if (update.my_chat_member) return "my_chat_member";
  if (update.channel_post) return "channel_post";
  return "unknown";
}

export function receiveDecision(
  existing: { status: string; receivedAt: number } | null,
  now = Date.now(),
  staleMs = STALE_MS,
): ReceiveKind {
  if (!existing) return "new";
  if (existing.status === "failed") return "retry";
  if (existing.status === "processed") return "duplicate";
  if (existing.status === "received" && now - existing.receivedAt >= staleMs) return "retry";
  return "duplicate";
}

export function shouldDispatchTelegramUpdate(kind: ReceiveKind): boolean {
  return kind !== "duplicate";
}

export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return code === "23505" || /duplicate|unique/i.test(msg);
}

async function ensureTables(sql: Sql) {
  await sql`
    create table if not exists telegram_updates (
      id bigserial primary key,
      update_id bigint not null unique,
      update_type text not null default 'unknown',
      received_at timestamptz not null default now(),
      processed_at timestamptz,
      status text not null default 'received',
      error_code text
    )
  `;
}

function mapExisting(row: { status: string; received_at: string | Date } | undefined) {
  if (!row) return null;
  const receivedAt = row.received_at instanceof Date ? row.received_at.getTime() : Date.parse(String(row.received_at));
  return { status: row.status, receivedAt: Number.isFinite(receivedAt) ? receivedAt : 0 };
}

export async function lookupTelegramUpdate(
  sql: Sql,
  updateId: number,
): Promise<{ status: string; receivedAt: number } | null> {
  const rows = await sql<{ status: string; received_at: string | Date }>`
    select status, received_at from telegram_updates where update_id = ${updateId}
  `;
  return mapExisting(rows[0]);
}

async function loadExisting(sql: Sql, updateId: number) {
  const rows = await sql<{ status: string; received_at: string | Date }>`
    select status, received_at from telegram_updates where update_id = ${updateId} for update
  `;
  return mapExisting(rows[0]);
}

async function markReceived(sql: Sql, updateId: number, updateType: string) {
  await sql`
    update telegram_updates
    set status = 'received',
        update_type = ${updateType},
        error_code = null,
        processed_at = null,
        received_at = now()
    where update_id = ${updateId}
  `;
}

export async function claimTelegramUpdate(
  sql: Sql,
  updateId: number,
  updateType: string,
): Promise<ReceiveKind> {
  await ensureTables(sql);
  const existing = await loadExisting(sql, updateId);
  const kind = receiveDecision(existing);
  if (kind === "duplicate") return "duplicate";
  if (kind === "retry" && existing) {
    await markReceived(sql, updateId, updateType);
    return "retry";
  }
  try {
    await sql`
      insert into telegram_updates (update_id, update_type, status)
      values (${updateId}, ${updateType}, 'received')
    `;
    return "new";
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await loadExisting(sql, updateId);
    const racedKind = receiveDecision(raced);
    if (racedKind === "retry" && raced) {
      await markReceived(sql, updateId, updateType);
      return "retry";
    }
    return "duplicate";
  }
}

export async function receiveTelegramUpdate(
  updateId: number,
  updateType: string,
): Promise<ReceiveKind> {
  const { withTransaction } = await import("@/lib/db");
  return withTransaction((sql) => claimTelegramUpdate(sql, updateId, updateType));
}

export async function isDuplicateTelegramUpdate(updateId: number, sql?: Sql): Promise<boolean> {
  let client = sql;
  if (!client) {
    const { getSql } = await import("@/lib/db");
    client = await getSql();
  }
  await ensureTables(client);
  const existing = await lookupTelegramUpdate(client, updateId);
  // Only skip already-finished updates. "received" may still be in waitUntil.
  return existing?.status === "processed";
}

export async function markTelegramUpdateProcessed(updateId: number) {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`
    update telegram_updates
    set status = 'processed', processed_at = now(), error_code = null
    where update_id = ${updateId}
  `;
}

export async function markTelegramUpdateFailed(updateId: number, errorCode: string) {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`
    update telegram_updates
    set status = 'failed', processed_at = now(), error_code = ${errorCode.slice(0, 200)}
    where update_id = ${updateId}
  `;
}
