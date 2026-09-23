import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import type { ExtractResult, MediaItem, MediaVariant } from "../media/types";
import { MONTHLY_CAP } from "./config.server";

export type QualityChoice = "360" | "480" | "720" | "1080" | "best" | "mp3" | "file" | "snap";

export type PickPayload = {
  sourceUrl: string;
  platform: string;
  title?: string;
  id?: string;
  text?: string;
  author?: string;
  items: MediaItem[];
  stamp: boolean;
};

const PICK_TTL_MS = 60 * 60 * 1000;

export function progressBar(used: number, cap: number, width = 10): string {
  if (!Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0) return "░".repeat(width);
  const ratio = Math.max(0, Math.min(1, used / cap));
  const filled = Math.round(ratio * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

export function monthlyLine(used: number, cap: number, unlimited: boolean): string {
  if (unlimited) return `هذا الشهر: ${used} تحميل · بلا حد`;
  return `هذا الشهر\n${progressBar(used, cap)} ${used}/${cap}`;
}

export function parseQualityCallback(data: string): { id: string; choice: QualityChoice } | null {
  const m = data.match(/^q:([a-f0-9]{8,16}):(360|480|720|1080|best|mp3|file|snap)$/);
  if (!m) return null;
  return { id: m[1]!, choice: m[2] as QualityChoice };
}

export function variantForChoice(item: MediaItem, choice: QualityChoice): MediaVariant {
  const variants = item.variants.length ? item.variants : [{ url: item.url, quality: "أصل", contentType: "video/mp4" }];
  if (choice === "mp3" || choice === "best" || choice === "file" || choice === "snap") {
    return [...variants].sort(
      (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.size ?? 0) - (a.size ?? 0),
    )[0]!;
  }
  const target = choice === "360" ? 360 : choice === "480" ? 480 : choice === "720" ? 720 : 1080;
  const scored = [...variants].sort((a, b) => {
    const da = Math.abs((a.height ?? target) - target);
    const db = Math.abs((b.height ?? target) - target);
    return da - db || (a.size ?? 9e15) - (b.size ?? 9e15);
  });
  return scored[0]!;
}

export function choiceLabel(choice: QualityChoice, variant?: MediaVariant): string {
  if (choice === "mp3") return "MP3";
  if (choice === "file") return "ملف";
  if (choice === "snap") return "سناب";
  if (choice === "best") return variant?.quality || "أصل";
  const got = variant?.height;
  if (got && Math.abs(got - Number(choice)) > 80) return `${choice}p → ${got}p`;
  return `${choice}p`;
}

async function ensure(sql: Awaited<ReturnType<typeof getSql>>) {
  await sql`
    create table if not exists media_picks (
      id text primary key,
      tg_id text not null,
      chat_id bigint not null,
      payload jsonb not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`alter table download_logs add column if not exists title text`;
  await sql`create index if not exists download_logs_tg_ok_idx on download_logs (tg_id, ok, created_at desc)`;
}

function newPickId(): string {
  return randomBytes(5).toString("hex");
}

export async function rememberClip(
  tgId: number,
  clip: { url: string; title?: string; platform?: string; mediaUrl?: string; thumbnail?: string; kind?: string },
): Promise<void> {
  const sql = await getSql();
  await sql`
    create table if not exists last_clips (
      tg_id text primary key,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    insert into last_clips (tg_id, payload)
    values (${String(tgId)}, ${JSON.stringify(clip)})
    on conflict (tg_id) do update set payload = excluded.payload, updated_at = now()
  `;
}

export async function recallClip(tgId: number) {
  const { lastClip, setLastClip } = await import("./session.server");
  const mem = lastClip(tgId);
  if (mem?.url) return mem;
  const sql = await getSql();
  await sql`
    create table if not exists last_clips (
      tg_id text primary key,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
  const rows = await sql<{ payload: { url?: string; title?: string; platform?: string; mediaUrl?: string; thumbnail?: string; kind?: string } }>`
    select payload from last_clips where tg_id = ${String(tgId)} limit 1
  `;
  const row = rows[0]?.payload;
  if (!row?.url) return undefined;
  const clip = {
    url: row.url,
    title: row.title,
    platform: row.platform,
    mediaUrl: row.mediaUrl,
    thumbnail: row.thumbnail,
    kind: row.kind,
  };
  setLastClip(tgId, clip);
  return clip;
}

export async function saveMediaPick(tgId: number, chatId: number, payload: PickPayload): Promise<string> {
  const sql = await getSql();
  await ensure(sql);
  const id = newPickId();
  await sql`
    insert into media_picks (id, tg_id, chat_id, payload)
    values (${id}, ${String(tgId)}, ${chatId}, ${JSON.stringify(payload)})
  `;
  return id;
}

export async function loadMediaPick(id: string, tgId: number): Promise<PickPayload | null> {
  const sql = await getSql();
  await ensure(sql);
  const rows = await sql<{ payload: PickPayload; created_at: string | Date }>`
    select payload, created_at from media_picks where id = ${id} and tg_id = ${String(tgId)} limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const at = row.created_at instanceof Date ? row.created_at.getTime() : Date.parse(String(row.created_at));
  if (!Number.isFinite(at) || Date.now() - at > PICK_TTL_MS) {
    await sql`delete from media_picks where id = ${id}`.catch(() => undefined);
    return null;
  }
  return row.payload;
}

export async function consumeMediaPick(id: string, tgId: number): Promise<void> {
  const sql = await getSql();
  await sql`delete from media_picks where id = ${id} and tg_id = ${String(tgId)}`.catch(() => undefined);
}

export async function monthDownloadCount(tgId: number): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ c: number }>`
    select count(*)::int as c
    from download_logs
    where tg_id = ${String(tgId)}
      and ok = true
      and created_at >= date_trunc('month', timezone('Asia/Riyadh', now())) at time zone 'Asia/Riyadh'
  `;
  return Number(rows[0]?.c ?? 0);
}

export type HistoryRow = {
  id: number;
  url: string;
  platform: string | null;
  title: string | null;
  created_at: string;
};

export async function listHistory(tgId: number, limit = 20): Promise<HistoryRow[]> {
  const sql = await getSql();
  await ensure(sql);
  const cap = Math.min(Math.max(limit, 1), 20);
  return sql<HistoryRow>`
    select id, url, platform, title, created_at::text
    from download_logs
    where tg_id = ${String(tgId)} and ok = true
    order by created_at desc
    limit ${cap}
  `;
}

export async function searchHistory(tgId: number, query: string, limit = 20): Promise<HistoryRow[]> {
  const q = query.trim().slice(0, 80);
  if (!q) return listHistory(tgId, limit);
  const sql = await getSql();
  await ensure(sql);
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const cap = Math.min(Math.max(limit, 1), 20);
  return sql<HistoryRow>`
    select id, url, platform, title, created_at::text
    from download_logs
    where tg_id = ${String(tgId)}
      and ok = true
      and (url ilike ${like} or coalesce(title, '') ilike ${like} or coalesce(platform, '') ilike ${like})
    order by created_at desc
    limit ${cap}
  `;
}

export async function historyUrl(id: number, tgId: number): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ url: string }>`
    select url from download_logs where id = ${id} and tg_id = ${String(tgId)} and ok = true limit 1
  `;
  return rows[0]?.url ?? null;
}

export function toPickPayload(result: ExtractResult, stamp: boolean): PickPayload {
  const video = result.items.find((i) => i.kind === "video" || i.kind === "gif" || i.kind === "audio") ?? result.items[0];
  const items = video ? [video] : [];
  return {
    sourceUrl: result.sourceUrl,
    platform: result.platform,
    title: result.title,
    id: result.id,
    text: result.text,
    author: result.author,
    items,
    stamp,
  };
}

export function pickToResult(payload: PickPayload): ExtractResult {
  return {
    platform: payload.platform,
    id: payload.id,
    title: payload.title,
    author: payload.author,
    text: payload.text,
    sourceUrl: payload.sourceUrl,
    items: payload.items,
  };
}

export const MONTHLY_LIMIT = MONTHLY_CAP;
