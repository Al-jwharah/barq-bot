import { createHash, randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { publicUrl } from "./origin";

async function ensure() {
  const sql = await getSql();
  await sql`
    create table if not exists account_tokens (
      token text primary key,
      tg_id text not null,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueAccountLink(tgId: number | string): Promise<string> {
  await ensure();
  const sql = await getSql();
  const token = randomBytes(18).toString("hex");
  await sql`
    insert into account_tokens (token, tg_id, expires_at)
    values (${hashToken(token)}, ${String(tgId)}, now() + interval '12 hours')
  `;
  return publicUrl(`/account?t=${token}`);
}

export async function loadAccount(token: string): Promise<{
  tgId: string;
  downloads: number;
  downloadsOk: number;
  monthly: number;
  daily: number;
  subscribedUntil: string | null;
  plan: string;
  points: number;
  topPlatform: string | null;
  files: Array<{ url: string; title: string | null; platform: string | null; at: string }>;
} | null> {
  if (!token || token.length < 16) return null;
  await ensure();
  const sql = await getSql();
  const tok = await sql<{ tg_id: string }>`
    select tg_id from account_tokens
    where token = ${hashToken(token)} and expires_at > now()
    limit 1
  `;
  const tgId = tok[0]?.tg_id;
  if (!tgId) return null;
  const member = await sql<{ subscribed_until: string | null; downloads_used: number; tier: string | null }>`
    select subscribed_until, downloads_used, tier from members where tg_id = ${tgId} limit 1
  `;
  const ok = await sql<{ c: number }>`
    select count(*)::int as c from download_logs where tg_id = ${tgId} and ok = true
  `;
  const month = await sql<{ c: number }>`
    select count(*)::int as c from download_logs
    where tg_id = ${tgId} and ok = true
      and created_at >= date_trunc('month', timezone('Asia/Riyadh', now()))
  `;
  const day = await sql<{ c: number }>`
    select count(*)::int as c from download_logs
    where tg_id = ${tgId} and ok = true
      and created_at >= date_trunc('day', timezone('Asia/Riyadh', now()))
  `;
  const files = await sql<{ url: string; title: string | null; platform: string | null; created_at: string }>`
    select url, title, platform, created_at::text
    from download_logs
    where tg_id = ${tgId} and ok = true
    order by created_at desc
    limit 20
  `;
  const top = await sql<{ platform: string | null; c: number }>`
    select platform, count(*)::int as c from download_logs
    where tg_id = ${tgId} and ok = true and platform is not null
    group by platform order by c desc limit 1
  `;
  const { pointsBalance } = await import("./points.server");
  const points = await pointsBalance(tgId).catch(() => 0);
  return {
    tgId,
    downloads: Number(member[0]?.downloads_used ?? 0),
    downloadsOk: Number(ok[0]?.c ?? 0),
    monthly: Number(month[0]?.c ?? 0),
    daily: Number(day[0]?.c ?? 0),
    subscribedUntil: member[0]?.subscribed_until ?? null,
    plan: member[0]?.tier || (member[0]?.subscribed_until ? "plus" : "free"),
    points,
    topPlatform: top[0]?.platform ?? null,
    files: files.map((f) => ({ url: f.url, title: f.title, platform: f.platform, at: f.created_at })),
  };
}
