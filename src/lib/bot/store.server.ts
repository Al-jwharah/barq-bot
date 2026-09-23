import { randomBytes } from "node:crypto";
import { BARQ_AI_DAILY, FREE_DOWNLOADS, isOwnerId, OWNER_TG_ID, SUB_DAYS } from "./config.server";
import { verifyPin } from "./admin-session.server";
import { consumePromo, findPromo, putPromo } from "./promo-blob.server";
import { findClipBlob, putClipBlob } from "./clip-blob.server";
import { generateClipId, isClipId } from "./clip-id";

export function normalizePromoInput(raw: string): string {
  const u = raw.trim().toUpperCase();
  const m = u.match(/BRQ[0-9A-F]{6}/);
  if (m) return m[0];
  return u.replace(/\s+/g, "");
}

async function sqlClient() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

export type Member = {
  tg_id: string;
  username: string | null;
  first_name: string | null;
  downloads_used: number;
  subscribed_until: string | null;
  is_admin: boolean;
  is_banned: boolean;
  role: string;
  tier: string;
  daily_limit: number;
  last_active: string | null;
  created_at: string;
};

export type ClipLink = {
  id: string;
  tg_id: string;
  url: string;
  media_url: string | null;
  thumbnail: string | null;
  kind: string | null;
  platform: string | null;
  created_at: string;
  expires_at: string | null;
  storage_key: string | null;
  hits: number;
  max_hits: number | null;
  revoked_at: string | null;
};

export const CLIP_TTL_MS = 24 * 60 * 60 * 1000;

function asBool(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1;
}

function rowToMember(r: Record<string, unknown>): Member {
  const tgId = String(r.tg_id);
  return {
    tg_id: tgId,
    username: (r.username as string | null) ?? null,
    first_name: (r.first_name as string | null) ?? null,
    downloads_used: Number(r.downloads_used ?? 0),
    subscribed_until: r.subscribed_until ? String(r.subscribed_until) : null,
    is_admin: asBool(r.is_admin) || isOwnerId(tgId),
    is_banned: asBool(r.is_banned),
    role: isOwnerId(tgId) ? "owner" : String(r.role ?? (asBool(r.is_admin) ? "admin" : "user")),
    tier: String(r.tier ?? "free"),
    daily_limit: Number(r.daily_limit ?? FREE_DOWNLOADS),
    last_active: r.last_active ? String(r.last_active) : null,
    created_at: String(r.created_at ?? ""),
  };
}

export function isSubscribed(member: Member, now = Date.now()): boolean {
  if (!member.subscribed_until) return false;
  const t = Date.parse(member.subscribed_until);
  return Number.isFinite(t) && t > now;
}

export async function upsertMember(input: {
  tgId: number | string;
  username?: string;
  firstName?: string;
}): Promise<Member & { isNew: boolean }> {
  const sql = await sqlClient();
  const id = String(input.tgId);
  const before = await getMember(id);
  const owner = isOwnerId(id);
  await sql`
    insert into members (tg_id, username, first_name, is_admin)
    values (${id}, ${input.username ?? null}, ${input.firstName ?? null}, ${owner})
    on conflict (tg_id) do update set
      username = coalesce(excluded.username, members.username),
      first_name = coalesce(excluded.first_name, members.first_name),
      is_admin = members.is_admin or excluded.is_admin
  `;
  const rows = await sql<Record<string, unknown>>`
    select * from members where tg_id = ${id}
  `;
  return { ...rowToMember(rows[0]!), isNew: !before };
}

export async function getMember(tgId: number | string): Promise<Member | null> {
  const sql = await sqlClient();
  const rows = await sql<Record<string, unknown>>`
    select * from members where tg_id = ${String(tgId)}
  `;
  return rows[0] ? rowToMember(rows[0]) : null;
}

export async function countMembers(): Promise<number> {
  const sql = await sqlClient();
  const rows = await sql<{ c: number }>`select count(*)::int as c from members`;
  return Number(rows[0]?.c ?? 0);
}

export async function launchSeat(tgId: number | string): Promise<number> {
  const sql = await sqlClient();
  const id = String(tgId);
  const rows = await sql<{ c: number }>`
    select count(*)::int as c from members m
    where m.created_at < (select created_at from members where tg_id = ${id})
       or (
         m.created_at = (select created_at from members where tg_id = ${id})
         and m.tg_id <= ${id}
       )
  `;
  return Number(rows[0]?.c ?? 0);
}

export async function getMemberByUsername(username: string): Promise<Member | null> {
  const u = username.replace(/^@/, "").trim().toLowerCase();
  if (!u) return null;
  const sql = await sqlClient();
  const rows = await sql<Record<string, unknown>>`
    select * from members where lower(coalesce(username, '')) = ${u} limit 1
  `;
  return rows[0] ? rowToMember(rows[0]) : null;
}

export async function canDownload(member: Member): Promise<{
  ok: boolean;
  remaining: number;
  subscribed: boolean;
}> {
  if (isOwnerId(member.tg_id) || member.is_admin) {
    return { ok: true, remaining: -1, subscribed: true };
  }
  const subscribed = isSubscribed(member);
  if (subscribed) return { ok: true, remaining: -1, subscribed: true };
  const remaining = Math.max(0, FREE_DOWNLOADS - member.downloads_used);
  return { ok: remaining > 0, remaining, subscribed: false };
}

export async function bumpDownload(tgId: number | string) {
  if (isOwnerId(tgId)) return;
  const sql = await sqlClient();
  await sql`
    update members set downloads_used = downloads_used + 1
    where tg_id = ${String(tgId)}
  `;
  await ensureDailyStats();
  await sql`
    insert into user_stats (tg_id, daily_dl, daily_dl_day)
    values (${String(tgId)}, 1, current_date)
    on conflict (tg_id) do update set
      daily_dl = case
        when user_stats.daily_dl_day = current_date then user_stats.daily_dl + 1
        else 1
      end,
      daily_dl_day = current_date
  `.catch(() => undefined);
}

async function ensureDailyStats() {
  const sql = await sqlClient();
  await sql`
    create table if not exists user_stats (
      tg_id text primary key,
      onboarding_step integer not null default -1,
      streak integer not null default 0,
      best_streak integer not null default 0,
      last_seen_day date,
      last_nudge_day date,
      downloads_ok integer not null default 0,
      ai_uses integer not null default 0,
      tips integer not null default 0,
      daily_dl integer not null default 0,
      daily_dl_day date,
      created_at timestamptz not null default now()
    )
  `.catch(() => undefined);
  await sql`alter table user_stats add column if not exists daily_dl integer not null default 0`.catch(
    () => undefined,
  );
  await sql`alter table user_stats add column if not exists daily_dl_day date`.catch(() => undefined);
}

export async function todayDownloads(tgId: number | string): Promise<number> {
  const { usageCount } = await import("./usage.server");
  return usageCount(tgId, "download");
}

export async function wipeEveryone(): Promise<{ members: number }> {
  const sql = await sqlClient();
  await ensureDailyStats();
  const members = await countMembers();
  await sql`update members set downloads_used = 0, subscribed_until = null`;
  await sql`update user_stats set daily_dl = 0, downloads_ok = 0, ai_uses = 0`.catch(() => undefined);
  await sql`delete from download_jobs`.catch(() => undefined);
  await sql`delete from clip_links`.catch(() => undefined);
  await sql`delete from download_logs`.catch(() => undefined);
  await sql`delete from filter_events`.catch(() => undefined);
  await sql`delete from growth_events`.catch(() => undefined);
  await sql`delete from user_achievements`.catch(() => undefined);
  await sql`delete from user_feedback`.catch(() => undefined);
  await sql`delete from user_journeys`.catch(() => undefined);
  await sql`delete from rate_buckets`.catch(() => undefined);
  await sql`delete from rate_limits`.catch(() => undefined);
  await sql`delete from usage_counters`.catch(() => undefined);
  await sql`delete from job_attempts`.catch(() => undefined);
  await sql`delete from app_events`.catch(() => undefined);
  const { flushDb } = await import("@/lib/db");
  await flushDb().catch(() => undefined);
  return { members };
}

export async function resetDownloads(tgId: number | string) {
  const sql = await sqlClient();
  await sql`
    update members set downloads_used = 0
    where tg_id = ${String(tgId)}
  `;
}

export async function logDownload(input: {
  tgId?: number | string;
  url: string;
  platform?: string;
  ok: boolean;
  blocked?: boolean;
  reason?: string;
  verdict?: string;
  title?: string;
}) {
  const sql = await sqlClient();
  await sql`alter table download_logs add column if not exists title text`.catch(() => undefined);
  await sql`
    insert into download_logs (tg_id, url, platform, ok, blocked, reason, verdict, title)
    values (
      ${input.tgId ? String(input.tgId) : null},
      ${input.url},
      ${input.platform ?? null},
      ${input.ok},
      ${Boolean(input.blocked)},
      ${input.reason ?? null},
      ${input.verdict ?? null},
      ${input.title ?? null}
    )
  `;
}

export async function logFilterEvent(input: {
  tgId?: number | string;
  url: string;
  kind: string;
  reason?: string;
  evidence?: string;
}) {
  const sql = await sqlClient();
  await sql`
    insert into filter_events (tg_id, url, kind, reason, evidence)
    values (
      ${input.tgId ? String(input.tgId) : null},
      ${input.url},
      ${input.kind},
      ${input.reason ?? null},
      ${input.evidence ?? null}
    )
  `;
}

export async function grantDays(tgId: number | string, days: number) {
  const sql = await sqlClient();
  const id = String(tgId);
  await sql`
    insert into members (tg_id) values (${id})
    on conflict (tg_id) do nothing
  `;
  await sql`
    update members
    set subscribed_until = case
      when subscribed_until is not null and subscribed_until > now()
        then subscribed_until + (${days} || ' days')::interval
      else now() + (${days} || ' days')::interval
    end
    where tg_id = ${id}
  `;
}

export async function setSubscriptionDays(tgId: number | string, days: number) {
  const sql = await sqlClient();
  const id = String(tgId);
  await sql`
    insert into members (tg_id) values (${id})
    on conflict (tg_id) do nothing
  `;
  if (days <= 0) {
    await sql`update members set subscribed_until = null, tier = 'free' where tg_id = ${id}`;
    return;
  }
  await sql`
    update members
    set subscribed_until = now() + (${days} || ' days')::interval
    where tg_id = ${id}
  `;
}

export async function recordPayment(
  tgId: number | string,
  stars: number,
  chargeId?: string,
  grant = true,
  plan?: string,
) {
  const { withTransaction } = await import("@/lib/db");
  return withTransaction(async (sql) => {
    if (chargeId) {
      const existing = await sql<{ c: number }>`
        select count(*)::int as c from payments where charge_id = ${chargeId}
      `;
      if (Number(existing[0]?.c ?? 0) > 0) return { duplicate: true };
    }
    try {
      await sql`
        insert into payments (tg_id, stars, charge_id, plan)
        values (${String(tgId)}, ${stars}, ${chargeId ?? null}, ${plan ?? null})
      `;
    } catch {
      return { duplicate: true };
    }
    if (grant && plan && plan !== "tip") {
      await sql`
        insert into members (tg_id) values (${String(tgId)})
        on conflict (tg_id) do nothing
      `;
      await sql`
        update members
        set subscribed_until = now() + (${SUB_DAYS} || ' days')::interval,
            tier = ${plan}
        where tg_id = ${String(tgId)}
      `;
    }
    return { duplicate: false };
  });
}

export async function createGiftCode(days = SUB_DAYS): Promise<string> {
  const sql = await sqlClient();
  for (let i = 0; i < 8; i += 1) {
    const code = `BRQ${randomBytes(3).toString("hex").toUpperCase()}`;
    try {
      await sql`
        insert into promo_codes (code, days, max_uses, used_count, active)
        values (${code}, ${days}, 1, 0, true)
      `;
      await putPromo({ code, days, max_uses: 1, used_count: 0, active: true });
      const { flushDb } = await import("@/lib/db");
      await flushDb().catch(() => undefined);
      return code;
    } catch {
      /* collision */
    }
  }
  throw new Error("تعذر إنشاء كود الهدية");
}

export async function redeemCode(
  tgId: number | string,
  raw: string,
): Promise<{ ok: boolean; message: string }> {
  const code = normalizePromoInput(raw);
  if (!code) return { ok: false, message: "أدخل كود صحيح" };
  const { withTransaction } = await import("@/lib/db");
  const result = await withTransaction(async (sql) => {
    const rows = await sql<{
      code: string;
      days: number;
      max_uses: number;
      used_count: number;
      active: boolean | string;
    }>`
      select code, days, max_uses, used_count, active from promo_codes where code = ${code} for update
    `;
    let row = rows[0]
      ? {
          code: rows[0].code,
          days: Number(rows[0].days),
          max_uses: Number(rows[0].max_uses),
          used_count: Number(rows[0].used_count),
          active: asBool(rows[0].active),
        }
      : null;
    if (!row) {
      const blob = await findPromo(code);
      if (blob) {
        row = {
          code: blob.code,
          days: Number(blob.days),
          max_uses: Number(blob.max_uses),
          used_count: Number(blob.used_count),
          active: blob.active,
        };
        await sql`
          insert into promo_codes (code, days, max_uses, used_count, active)
          values (${row.code}, ${row.days}, ${row.max_uses}, ${row.used_count}, ${row.active})
          on conflict (code) do nothing
        `;
      }
    }
    if (!row || !row.active) return { ok: false as const, message: "الكود غير صالح" };
    const taken = await sql<{ days: number }>`
      update promo_codes
      set used_count = used_count + 1
      where code = ${row.code} and active = true and used_count < max_uses
      returning days
    `;
    if (!taken[0]) return { ok: false as const, message: "هذا الكود استُنفد" };
    const days = Number(taken[0].days || row.days);
    await sql`insert into members (tg_id) values (${String(tgId)}) on conflict (tg_id) do nothing`;
    await sql`
      update members
      set subscribed_until = now() + (${days} || ' days')::interval
      where tg_id = ${String(tgId)}
    `;
    return { ok: true as const, message: `تم التفعيل ${days} يوم`, days };
  });
  if (result.ok) await consumePromo(code).catch(() => undefined);
  return { ok: result.ok, message: result.message };
}

const PAID_GIFT_CODES = ["BRQ18CC1A", "BRQB736DF"] as const;

export async function ensurePaidGiftCodes() {
  const sql = await sqlClient();
  for (const code of PAID_GIFT_CODES) {
    const rows = await sql<{ used_count: number }>`
      select used_count from promo_codes where code = ${code}
    `;
    const used = Number(rows[0]?.used_count ?? 0);
    if (used >= 1) continue;
    await sql`
      insert into promo_codes (code, days, max_uses, used_count, active)
      values (${code}, ${SUB_DAYS}, 1, 0, true)
      on conflict (code) do update set active = true, days = ${SUB_DAYS}, max_uses = 1
    `;
    await putPromo({ code, days: SUB_DAYS, max_uses: 1, used_count: 0, active: true });
  }
}

export async function takeAiTurn(tgId: number | string, limit = BARQ_AI_DAILY): Promise<{
  ok: boolean;
  used: number;
  remaining: number;
  retryAfter?: number;
}> {
  const { takeUsage } = await import("./usage.server");
  const r = await takeUsage(tgId, "ai", limit);
  return { ok: r.ok, used: r.count, remaining: r.remaining, retryAfter: r.retryAfter };
}

async function ensureBanColumn() {
  const sql = await sqlClient();
  await sql`alter table members add column if not exists is_banned boolean not null default false`;
}

async function ensureBansTable() {
  const sql = await sqlClient();
  await sql`
    create table if not exists bans (
      id text primary key,
      user_id text not null,
      reason text,
      category text,
      created_by text,
      created_at timestamptz not null default now(),
      expires_at timestamptz,
      status text not null default 'active',
      appeal_status text,
      appeal_text text,
      updated_at timestamptz
    )
  `;
  await sql`alter table bans add column if not exists updated_at timestamptz`.catch(() => undefined);
  await sql`create index if not exists bans_user_idx on bans (user_id, created_at desc)`.catch(() => undefined);
}

export async function banUser(tgId: number | string, reason = "ban", actor?: string) {
  await ensureBanColumn();
  await ensureBansTable();
  const sql = await sqlClient();
  const id = String(tgId);
  await sql`
    insert into members (tg_id, is_banned) values (${id}, true)
    on conflict (tg_id) do update set is_banned = true
  `;
  await sql`
    insert into bans (id, user_id, reason, category, created_by, status, appeal_status, updated_at)
    values (
      ${`ban-${id}-${Date.now()}`},
      ${id},
      ${reason.slice(0, 400)},
      ${"manual"},
      ${actor ? String(actor) : null},
      ${"active"},
      ${null},
      now()
    )
  `;
}

export async function unbanUser(tgId: number | string) {
  await ensureBanColumn();
  await ensureBansTable();
  const sql = await sqlClient();
  const id = String(tgId);
  await sql`update members set is_banned = false where tg_id = ${id}`;
  await sql`
    update bans
    set status = 'lifted', updated_at = now()
    where user_id = ${id} and status = 'active'
  `.catch(() => undefined);
}

export async function appealBan(tgId: number | string, text: string): Promise<{ ok: boolean; fresh: boolean }> {
  await ensureBanColumn();
  await ensureBansTable();
  const sql = await sqlClient();
  const id = String(tgId);
  const note = text.slice(0, 500);
  const existing = await sql<{ id: string; appeal_status: string | null }>`
    select id, appeal_status from bans
    where user_id = ${id} and status = 'active'
    order by created_at desc
    limit 1
  `.catch(() => [] as { id: string; appeal_status: string | null }[]);
  if (existing[0]) {
    const fresh = existing[0].appeal_status !== "open";
    await sql`
      update bans
      set appeal_status = 'open', appeal_text = ${note}, updated_at = now()
      where id = ${existing[0].id}
    `;
    return { ok: true, fresh };
  }
  try {
    await sql`
      insert into bans (id, user_id, reason, category, status, appeal_status, appeal_text, updated_at)
      values (
        ${`ban-${id}-${Date.now()}`},
        ${id},
        ${"legacy"},
        ${"manual"},
        ${"active"},
        ${"open"},
        ${note},
        now()
      )
    `;
    return { ok: true, fresh: true };
  } catch {
    return { ok: false, fresh: false };
  }
}

export async function decideAppeal(
  tgId: number | string,
  accept: boolean,
  actor: string,
): Promise<boolean> {
  await ensureBanColumn();
  await ensureBansTable();
  const id = String(tgId);
  const sql = await sqlClient();
  if (accept) {
    const member = await getMember(id);
    await unbanUser(id);
    const rows = await sql<{ id: string }>`
      update bans
      set
        appeal_status = 'accepted',
        status = 'lifted',
        updated_at = now(),
        created_by = coalesce(created_by, ${actor})
      where user_id = ${id}
      returning id
    `.catch(() => [] as { id: string }[]);
    return Boolean(rows[0]) || Boolean(member?.is_banned);
  }
  const rows = await sql<{ id: string }>`
    update bans
    set
      appeal_status = 'rejected',
      updated_at = now(),
      created_by = coalesce(created_by, ${actor})
    where user_id = ${id} and status = 'active' and appeal_status = 'open'
    returning id
  `.catch(() => [] as { id: string }[]);
  return Boolean(rows[0]);
}

export async function listOpenAppeals(limit = 20): Promise<
  Array<{ user_id: string; reason: string | null; appeal_text: string | null; created_at: string }>
> {
  await ensureBansTable();
  const sql = await sqlClient();
  const n = Math.min(Math.max(1, limit), 50);
  return sql<{ user_id: string; reason: string | null; appeal_text: string | null; created_at: string }>`
    select user_id, reason, appeal_text, created_at::text as created_at
    from bans
    where status = 'active' and appeal_status = 'open'
    order by coalesce(updated_at, created_at) desc
    limit ${n}
  `.catch(() => []);
}


export async function isBanned(tgId: number | string): Promise<boolean> {
  if (isOwnerId(tgId)) return false;
  const member = await getMember(tgId);
  return Boolean(member?.is_banned);
}

export async function markAdmin(tgId: number | string) {
  const sql = await sqlClient();
  await sql`
    insert into members (tg_id, is_admin) values (${String(tgId)}, true)
    on conflict (tg_id) do update set is_admin = true
  `;
}

/** Yearly max plan and the named moderator. Safe to call on every health check. */
export async function ensurePrivileges() {
  const sql = await sqlClient();
  const vip = "5059912532";
  const mod = "8942297498";
  await sql`
    insert into members (tg_id, tier) values (${vip}, 'vip')
    on conflict (tg_id) do update set tier = 'vip'
  `;
  await sql`
    update members
    set subscribed_until = now() + interval '365 days'
    where tg_id = ${vip}
      and (subscribed_until is null or subscribed_until < now() + interval '300 days')
  `;
  await sql`
    insert into members (tg_id, role, is_admin) values (${mod}, 'moderator', false)
    on conflict (tg_id) do update set role = 'moderator'
  `;
}

export function pinOk(pin: string): boolean {
  return verifyPin(pin);
}

export async function adminStats() {
  const sql = await sqlClient();
  const members = await sql<{ c: number }>`select count(*)::int as c from members`;
  const subs = await sql<{ c: number }>`
    select count(*)::int as c from members
    where subscribed_until is not null and subscribed_until > now()
  `;
  const downloads = await sql<{ c: number }>`select count(*)::int as c from download_logs`;
  const stars = await sql<{ s: number }>`select coalesce(sum(stars),0)::int as s from payments`;
  const blocked = await sql<{ c: number }>`
    select count(*)::int as c from download_logs where blocked = true
  `;
  const failed = await sql<{ c: number }>`
    select count(*)::int as c from download_logs where ok = false and blocked = false
  `;
  const clips = await sql<{ c: number }>`select count(*)::int as c from clip_links`;
  return {
    members: Number(members[0]?.c ?? 0),
    subscribers: Number(subs[0]?.c ?? 0),
    downloads: Number(downloads[0]?.c ?? 0),
    stars: Number(stars[0]?.s ?? 0),
    blocked: Number(blocked[0]?.c ?? 0),
    failed: Number(failed[0]?.c ?? 0),
    clips: Number(clips[0]?.c ?? 0),
    ownerId: OWNER_TG_ID,
  };
}

export async function listMembers(limit = 80) {
  const sql = await sqlClient();
  const rows = await sql<Record<string, unknown>>`
    select * from members order by created_at desc limit ${limit}
  `;
  return rows.map(rowToMember);
}

export async function listLogs(limit = 80) {
  const sql = await sqlClient();
  const rows = await sql<{
    id: number;
    tg_id: string | null;
    url: string;
    platform: string | null;
    ok: boolean | string;
    blocked: boolean | string | null;
    reason: string | null;
    verdict: string | null;
    created_at: string;
  }>`
    select id, tg_id, url, platform, ok, blocked, reason, verdict, created_at
    from download_logs
    order by id desc
    limit ${limit}
  `;
  return rows.map((r) => ({
    ...r,
    ok: asBool(r.ok),
    blocked: asBool(r.blocked),
  }));
}

export async function listFilterEvents(limit = 40) {
  const sql = await sqlClient();
  const rows = await sql<{
    id: number;
    tg_id: string | null;
    url: string;
    kind: string;
    reason: string | null;
    evidence: string | null;
    created_at: string;
  }>`
    select id, tg_id, url, kind, reason, evidence, created_at
    from filter_events
    order by id desc
    limit ${limit}
  `;
  return rows;
}

export async function listCodes() {
  const sql = await sqlClient();
  const rows = await sql<{
    code: string;
    days: number;
    max_uses: number;
    used_count: number;
    active: boolean | string;
    created_at: string;
  }>`
    select code, days, max_uses, used_count, active, created_at
    from promo_codes
    order by created_at desc
  `;
  return rows.map((r) => ({
    ...r,
    active: asBool(r.active),
  }));
}

export async function createCode(code: string, days: number, maxUses: number) {
  const sql = await sqlClient();
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  await sql`
    insert into promo_codes (code, days, max_uses)
    values (${normalized}, ${days}, ${maxUses})
    on conflict (code) do update set days = excluded.days, max_uses = excluded.max_uses, active = true, used_count = promo_codes.used_count
  `;
  const existing = await findPromo(normalized);
  await putPromo({
    code: normalized,
    days,
    max_uses: maxUses,
    used_count: existing?.used_count ?? 0,
    active: true,
  });
  return normalized;
}

export async function setCodeActive(code: string, active: boolean) {
  const sql = await sqlClient();
  await sql`
    update promo_codes set active = ${active}
    where code = ${code.trim().toUpperCase()}
  `;
}

export async function memberIds(): Promise<string[]> {
  const sql = await sqlClient();
  const rows = await sql<{ tg_id: string }>`select tg_id from members`;
  return rows.map((r) => r.tg_id);
}

export async function listFreeMemberIds(): Promise<string[]> {
  const sql = await sqlClient();
  const rows = await sql<{ tg_id: string }>`
    select tg_id from members
    where (subscribed_until is null or subscribed_until < now())
  `;
  return rows.map((r) => r.tg_id);
}

export async function getSettings(): Promise<Record<string, string>> {
  const sql = await sqlClient();
  const rows = await sql<{ key: string; value: string }>`select key, value from bot_settings`;
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export async function setSetting(key: string, value: string) {
  const sql = await sqlClient();
  await sql`
    insert into bot_settings (key, value, updated_at)
    values (${key}, ${value}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export async function toggleSetting(key: string): Promise<string> {
  const current = (await getSettings())[key];
  const next = current === "on" ? "off" : "on";
  await setSetting(key, next);
  return next;
}

function newClipId(): string {
  return generateClipId();
}

export function clipAlive(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(String(expiresAt));
  return Number.isFinite(t) && t > Date.now();
}

async function ensureClipColumns() {
  const sql = await sqlClient();
  await sql`alter table clip_links add column if not exists storage_key text`.catch(() => undefined);
  await sql`alter table clip_links add column if not exists hits integer not null default 0`.catch(() => undefined);
  await sql`alter table clip_links add column if not exists max_hits integer`.catch(() => undefined);
  await sql`alter table clip_links add column if not exists revoked_at timestamptz`.catch(() => undefined);
}

function mapClip(r: Record<string, unknown>): ClipLink {
  return {
    id: String(r.id),
    tg_id: String(r.tg_id ?? ""),
    url: String(r.url ?? ""),
    media_url: (r.media_url as string | null) ?? null,
    thumbnail: (r.thumbnail as string | null) ?? null,
    kind: (r.kind as string | null) ?? null,
    platform: (r.platform as string | null) ?? null,
    created_at: String(r.created_at ?? ""),
    expires_at: r.expires_at ? String(r.expires_at) : null,
    storage_key: (r.storage_key as string | null) ?? null,
    hits: Number(r.hits ?? 0),
    max_hits: r.max_hits == null ? null : Number(r.max_hits),
    revoked_at: r.revoked_at ? String(r.revoked_at) : null,
  };
}

export async function createClipLink(input: {
  tgId: number | string;
  url: string;
  mediaUrl?: string;
  thumbnail?: string;
  kind?: string;
  platform?: string;
  storageKey?: string;
  maxHits?: number | null;
}): Promise<{ id: string; expiresAt: string }> {
  await ensureClipColumns();
  const sql = await sqlClient();
  const created = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CLIP_TTL_MS).toISOString();
  for (let i = 0; i < 6; i += 1) {
    const id = newClipId();
    try {
      await sql`
        insert into clip_links (id, tg_id, url, media_url, thumbnail, kind, platform, expires_at, storage_key, hits, max_hits)
        values (
          ${id},
          ${String(input.tgId)},
          ${input.url},
          ${input.mediaUrl ?? null},
          ${input.thumbnail ?? null},
          ${input.kind ?? null},
          ${input.platform ?? null},
          ${expiresAt},
          ${input.storageKey ?? null},
          0,
          ${input.maxHits ?? null}
        )
      `;
      await putClipBlob({
        id,
        tg_id: String(input.tgId),
        url: input.url,
        media_url: input.mediaUrl ?? null,
        thumbnail: input.thumbnail ?? null,
        kind: input.kind ?? null,
        platform: input.platform ?? null,
        created_at: created,
        expires_at: expiresAt,
        storage_key: input.storageKey ?? null,
        hits: 0,
        max_hits: input.maxHits ?? null,
      });
      const { flushDb } = await import("@/lib/db");
      await flushDb().catch(() => undefined);
      return { id, expiresAt };
    } catch {
      /* collision or missing column */
    }
  }
  throw new Error("تعذر إنشاء الرابط المختصر");
}

export async function getClipLink(id: string): Promise<ClipLink | null> {
  if (!isClipId(id)) return null;
  await ensureClipColumns();
  const sql = await sqlClient();
  const rows = await sql<Record<string, unknown>>`
    select id, tg_id, url, media_url, thumbnail, kind, platform, created_at, expires_at, storage_key, hits, max_hits
    from clip_links
    where id = ${id}
    limit 1
  `;
  const row = rows[0] ? mapClip(rows[0]) : null;
  if (row?.revoked_at) return null;
  if (row && clipAlive(row.expires_at)) {
    if (row.max_hits != null && row.hits >= row.max_hits) return null;
    return row;
  }
  const blob = await findClipBlob(id);
  if (!blob || !clipAlive(blob.expires_at)) return null;
  await sql`
    insert into clip_links (id, tg_id, url, media_url, thumbnail, kind, platform, expires_at, storage_key, hits, max_hits)
    values (
      ${blob.id}, ${blob.tg_id}, ${blob.url}, ${blob.media_url}, ${blob.thumbnail},
      ${blob.kind}, ${blob.platform}, ${blob.expires_at}, ${blob.storage_key ?? null},
      ${blob.hits ?? 0}, ${blob.max_hits ?? null}
    )
    on conflict (id) do nothing
  `.catch(() => undefined);
  return {
    id: blob.id,
    tg_id: blob.tg_id,
    url: blob.url,
    media_url: blob.media_url,
    thumbnail: blob.thumbnail,
    kind: blob.kind,
    platform: blob.platform,
    created_at: blob.created_at,
    expires_at: blob.expires_at,
    storage_key: blob.storage_key ?? null,
    hits: blob.hits ?? 0,
    max_hits: blob.max_hits ?? null,
    revoked_at: null,
  };
}

export async function consumeClip(id: string): Promise<ClipLink | null> {
  if (!isClipId(id)) return null;
  await ensureClipColumns();
  const sql = await sqlClient();
  const rows = await sql<Record<string, unknown>>`
    update clip_links
    set hits = hits + 1
    where id = ${id}
      and expires_at is not null
      and expires_at > now()
      and (max_hits is null or hits < max_hits)
      and revoked_at is null
    returning id, tg_id, url, media_url, thumbnail, kind, platform, created_at, expires_at, storage_key, hits, max_hits
  `;
  if (rows[0]) return mapClip(rows[0]);
  const existing = await getClipLink(id);
  if (!existing) return null;
  const rows2 = await sql<Record<string, unknown>>`
    update clip_links
    set hits = hits + 1
    where id = ${id}
      and expires_at is not null
      and expires_at > now()
      and (max_hits is null or hits < max_hits)
      and revoked_at is null
    returning id, tg_id, url, media_url, thumbnail, kind, platform, created_at, expires_at, storage_key, hits, max_hits
  `;
  return rows2[0] ? mapClip(rows2[0]) : null;
}

export async function listClips(limit = 40) {
  await ensureClipColumns();
  const sql = await sqlClient();
  const rows = await sql<Record<string, unknown>>`
    select id, tg_id, kind, platform, created_at, expires_at, hits, max_hits
    from clip_links
    where expires_at is not null and expires_at > now()
    order by created_at desc
    limit ${limit}
  `;
  return rows.map(mapClip);
}

export async function claimUpdate(id: number): Promise<boolean> {
  const { receiveTelegramUpdate } = await import("./telegram-updates.server");
  const kind = await receiveTelegramUpdate(id, "unknown");
  return kind !== "duplicate";
}

export type Contest = {
  id: string;
  title: string;
  prize: string;
  rules: string;
  winners_count: number;
  grant_days: number;
  channel_message_id: number | null;
  status: string;
  created_at: string;
};

function rowToContest(r: Record<string, unknown>): Contest {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    prize: String(r.prize ?? ""),
    rules: String(r.rules ?? ""),
    winners_count: Number(r.winners_count ?? 1),
    grant_days: Number(r.grant_days ?? 0),
    channel_message_id: r.channel_message_id == null ? null : Number(r.channel_message_id),
    status: String(r.status ?? "open"),
    created_at: String(r.created_at ?? ""),
  };
}

export async function createContest(input: {
  title: string;
  prize: string;
  rules?: string;
  winnersCount?: number;
  grantDays?: number;
}): Promise<Contest> {
  const sql = await sqlClient();
  const id = randomBytes(4).toString("hex");
  const winners = Math.min(20, Math.max(1, Math.floor(input.winnersCount ?? 1)));
  const days = Math.min(365, Math.max(0, Math.floor(input.grantDays ?? 0)));
  await sql`
    insert into contests (id, title, prize, rules, winners_count, grant_days, status)
    values (${id}, ${input.title.slice(0, 180)}, ${input.prize.slice(0, 180)}, ${
      (input.rules ?? "").slice(0, 800)
    }, ${winners}, ${days}, 'open')
  `;
  const rows = await sql<Record<string, unknown>>`select * from contests where id = ${id}`;
  return rowToContest(rows[0]!);
}

export async function setContestMessage(id: string, messageId: number) {
  const sql = await sqlClient();
  await sql`update contests set channel_message_id = ${messageId} where id = ${id}`;
}

export async function getContest(id: string): Promise<Contest | null> {
  const sql = await sqlClient();
  const rows = await sql<Record<string, unknown>>`select * from contests where id = ${id}`;
  return rows[0] ? rowToContest(rows[0]) : null;
}

export async function latestOpenContest(): Promise<Contest | null> {
  const sql = await sqlClient();
  const rows = await sql<Record<string, unknown>>`
    select * from contests where status = 'open' order by created_at desc limit 1
  `;
  return rows[0] ? rowToContest(rows[0]) : null;
}

export async function listContests(limit = 10): Promise<Contest[]> {
  const sql = await sqlClient();
  const rows = await sql<Record<string, unknown>>`
    select * from contests order by created_at desc limit ${Math.min(30, Math.max(1, limit))}
  `;
  return rows.map(rowToContest);
}

export async function enterContest(
  contestId: string,
  tgId: number | string,
  username?: string,
  firstName?: string,
): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  const contest = await getContest(contestId);
  if (!contest) return { ok: false, error: "المسابقة غير موجودة" };
  if (contest.status !== "open") return { ok: false, error: "المسابقة مغلقة" };
  const sql = await sqlClient();
  try {
    await sql`
      insert into contest_entries (contest_id, tg_id, username, first_name)
      values (${contestId}, ${String(tgId)}, ${username ?? null}, ${firstName ?? null})
    `;
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/duplicate|unique/i.test(msg) || (err as { code?: string }).code === "23505") {
      return { ok: false, already: true };
    }
    throw err;
  }
}

export async function contestEntryCount(contestId: string): Promise<number> {
  const sql = await sqlClient();
  const rows = await sql<{ c: number }>`
    select count(*)::int as c from contest_entries where contest_id = ${contestId}
  `;
  return Number(rows[0]?.c ?? 0);
}

export async function drawContestWinners(contestId: string): Promise<{
  contest: Contest;
  winners: Array<{ tg_id: string; username: string | null; first_name: string | null }>;
}> {
  const contest = await getContest(contestId);
  if (!contest) throw new Error("المسابقة غير موجودة");
  const sql = await sqlClient();
  const winners = await sql<{ tg_id: string; username: string | null; first_name: string | null }>`
    select tg_id, username, first_name from contest_entries
    where contest_id = ${contestId}
    order by random()
    limit ${contest.winners_count}
  `;
  await sql`update contests set status = 'closed' where id = ${contestId}`;
  return { contest, winners };
}

export async function logAiUsage(input: { tgId: number | string; model?: string; tokens?: number }) {
  try {
    const sql = await sqlClient();
    await sql`
      insert into ai_usage (tg_id, model, tokens, requests, day)
      values (${String(input.tgId)}, ${input.model ?? null}, ${input.tokens ?? null}, 1, current_date)
    `;
  } catch {
    /* table may not exist yet */
  }
}

export async function setMemberRole(tgId: number | string, role: string) {
  const sql = await sqlClient();
  await sql`
    insert into members (tg_id) values (${String(tgId)})
    on conflict (tg_id) do nothing
  `;
  await sql`update members set role = ${role}, is_admin = ${role === "admin" || role === "owner"} where tg_id = ${String(tgId)}`;
}

export async function setMemberTier(tgId: number | string, tier: string) {
  const sql = await sqlClient();
  await sql`update members set tier = ${tier} where tg_id = ${String(tgId)}`;
}

export async function listAudit(limit = 40) {
  const sql = await sqlClient();
  try {
    return await sql<{
      id: number;
      actor_id: string | null;
      action: string;
      target: string | null;
      detail: string | null;
      created_at: string;
    }>`select * from audit_log order by id desc limit ${limit}`;
  } catch {
    return [];
  }
}

export async function expireOldClips() {
  const sql = await sqlClient();
  await ensureClipColumns();
  const stale = await sql<{ storage_key: string | null; media_url: string | null }>`
    select storage_key, media_url from clip_links
    where expires_at is not null and expires_at < now()
  `.catch(() => []);
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token && stale.length) {
    const { del } = await import("@vercel/blob");
    const keys = stale
      .flatMap((r) => [r.storage_key, r.media_url])
      .filter((v): v is string => Boolean(v && (v.startsWith("host/") || v.includes("blob.vercel-storage.com"))));
    if (keys.length) await del(keys, { token }).catch(() => undefined);
  }
  await sql`delete from clip_links where expires_at is not null and expires_at < now()`;
}

export async function backupSnapshot() {
  const sql = await sqlClient();
  const settings = await getSettings();
  const codes = await listCodes();
  const members = await listMembers(500);
  const usage = await sql<{ user_id: string; day: string; action: string; count: number }>`
    select user_id, day::text as day, action, count from usage_counters
  `.catch(() => []);
  return {
    at: new Date().toISOString(),
    settings,
    codes,
    members: members.map((m) => ({
      tg_id: m.tg_id,
      username: m.username,
      role: m.role,
      tier: m.tier,
      is_banned: m.is_banned,
    })),
    usage,
  };
}

export async function restoreBackup(snap: {
  settings?: Record<string, string>;
  codes?: Array<{ code: string; days: number; max_uses: number; used_count: number; active: boolean }>;
  members?: Array<{ tg_id: string; username?: string | null; role?: string; tier?: string; is_banned?: boolean }>;
  usage?: Array<{ user_id: string; day: string; action: string; count: number }>;
}) {
  const { withTransaction } = await import("@/lib/db");
  return withTransaction(async (sql) => {
    if (snap.settings) {
      for (const [key, value] of Object.entries(snap.settings)) {
        await sql`
          insert into bot_settings (key, value) values (${key}, ${value})
          on conflict (key) do update set value = excluded.value
        `;
      }
    }
    if (snap.members) {
      for (const m of snap.members) {
        await sql`
          insert into members (tg_id, username, role, tier, is_banned)
          values (${m.tg_id}, ${m.username ?? null}, ${m.role ?? "user"}, ${m.tier ?? "free"}, ${Boolean(m.is_banned)})
          on conflict (tg_id) do update set
            username = coalesce(excluded.username, members.username),
            role = excluded.role,
            tier = excluded.tier,
            is_banned = excluded.is_banned
        `;
      }
    }
    if (snap.usage) {
      for (const u of snap.usage) {
        await sql`
          insert into usage_counters (user_id, day, action, count)
          values (${u.user_id}, ${u.day}::date, ${u.action}, ${u.count})
          on conflict (user_id, day, action) do update set count = excluded.count
        `;
      }
    }
    return { ok: true, members: snap.members?.length ?? 0, usage: snap.usage?.length ?? 0 };
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function snapshotShape(snap: unknown): {
  ok: boolean;
  errors: string[];
  settings: number;
  codes: number;
  members: number;
  usage: number;
} {
  const errors: string[] = [];
  if (!isRecord(snap)) {
    return { ok: false, errors: ["snapshot"], settings: 0, codes: 0, members: 0, usage: 0 };
  }
  let settings = 0;
  let codes = 0;
  let members = 0;
  let usage = 0;
  if (snap.settings !== undefined) {
    if (!isRecord(snap.settings) || Object.values(snap.settings).some((v) => typeof v !== "string")) {
      errors.push("settings");
    } else settings = Object.keys(snap.settings).length;
  }
  if (snap.codes !== undefined) {
    if (!Array.isArray(snap.codes) || snap.codes.some((c) => !isRecord(c) || typeof c.code !== "string")) {
      errors.push("codes");
    } else codes = snap.codes.length;
  }
  if (snap.members !== undefined) {
    if (
      !Array.isArray(snap.members) ||
      snap.members.some((m) => !isRecord(m) || (typeof m.tg_id !== "string" && typeof m.tg_id !== "number"))
    ) {
      errors.push("members");
    } else members = snap.members.length;
  }
  if (snap.usage !== undefined) {
    if (
      !Array.isArray(snap.usage) ||
      snap.usage.some((u) => !isRecord(u) || typeof u.user_id !== "string" || typeof u.action !== "string")
    ) {
      errors.push("usage");
    } else usage = snap.usage.length;
  }
  return { ok: errors.length === 0, errors, settings, codes, members, usage };
}

/** Dry-run: validate snapshot shape. Does not write rows. Never logs snapshot contents. */
export async function restoreTest(snap: unknown) {
  const shape = snapshotShape(snap);
  const { logEvent } = await import("./observability.server");
  await logEvent({
    action: "restore_test_completed",
    status: shape.ok ? "ok" : "error",
    detail: `settings=${shape.settings} codes=${shape.codes} members=${shape.members} usage=${shape.usage}`,
  });
  return { ...shape, applied: false as const };
}
