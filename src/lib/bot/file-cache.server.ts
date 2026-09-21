import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";

function hashUrl(url: string): string {
  return createHash("sha256").update(url.trim()).digest("hex").slice(0, 32);
}

export function cacheKeyFor(url: string): string {
  return hashUrl(url);
}

async function ensure() {
  const sql = await getSql();
  await sql`
    create table if not exists telegram_file_cache (
      url_hash text primary key,
      url text not null,
      file_id text not null,
      kind text not null default 'video',
      hits int not null default 0,
      platform text,
      quality text,
      size_bytes bigint,
      created_at timestamptz not null default now(),
      last_used timestamptz not null default now()
    )
  `;
  await sql`alter table telegram_file_cache add column if not exists platform text`.catch(() => undefined);
  await sql`alter table telegram_file_cache add column if not exists quality text`.catch(() => undefined);
  await sql`alter table telegram_file_cache add column if not exists size_bytes bigint`.catch(() => undefined);
  await sql`alter table telegram_file_cache add column if not exists last_used timestamptz`.catch(() => undefined);
}

export async function cachedTelegramFile(url: string): Promise<{ fileId: string; kind: string } | null> {
  try {
    const sql = await getSql();
    await ensure();
    const hash = hashUrl(url);
    const rows = await sql<{ file_id: string; kind: string }>`
      select file_id, kind from telegram_file_cache
      where url_hash = ${hash}
        and created_at > now() - interval '36 hours'
      limit 1
    `;
    const row = rows[0];
    if (!row?.file_id) return null;
    await sql`update telegram_file_cache set hits = hits + 1, last_used = now() where url_hash = ${hash}`.catch(() => undefined);
    return { fileId: row.file_id, kind: row.kind || "video" };
  } catch {
    return null;
  }
}

export async function saveTelegramFile(
  url: string,
  fileId: string,
  kind = "video",
  meta?: { platform?: string; quality?: string; size?: number },
): Promise<void> {
  if (!url || !fileId) return;
  try {
    const sql = await getSql();
    await ensure();
    const hash = hashUrl(url);
    await sql`
      insert into telegram_file_cache (url_hash, url, file_id, kind, hits, platform, quality, size_bytes, last_used)
      values (
        ${hash}, ${url.slice(0, 500)}, ${fileId}, ${kind}, 0,
        ${meta?.platform ?? null}, ${meta?.quality ?? null}, ${meta?.size ?? null}, now()
      )
      on conflict (url_hash) do update set
        file_id = excluded.file_id,
        kind = excluded.kind,
        platform = coalesce(excluded.platform, telegram_file_cache.platform),
        quality = coalesce(excluded.quality, telegram_file_cache.quality),
        size_bytes = coalesce(excluded.size_bytes, telegram_file_cache.size_bytes),
        created_at = now(),
        last_used = now()
    `;
  } catch {
    /* cache is optional */
  }
}

export async function cleanupFileCache(): Promise<number> {
  try {
    const sql = await getSql();
    await ensure();
    const rows = await sql<{ c: number }>`
      with d as (
        delete from telegram_file_cache
        where created_at < now() - interval '36 hours'
        returning 1
      )
      select count(*)::int as c from d
    `;
    return Number(rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}
