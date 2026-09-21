import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";
import type { ExtractResult } from "../media/types";
import { DAILY_CAP } from "./config.server";
import { progressBar } from "./library.server";

export function stageProgress(stage: "safe" | "extract" | "preview" | "upload" | "done"): { pct: number; bar: string; label: string } {
  const map = { safe: 15, extract: 45, preview: 70, upload: 90, done: 100 } as const;
  const pct = map[stage];
  const width = 10;
  const filled = Math.round((pct / 100) * width);
  return {
    pct,
    bar: `${"█".repeat(filled)}${"░".repeat(width - filled)}`,
    label:
      stage === "safe"
        ? "فحص الأمان"
        : stage === "extract"
          ? "تجهيز الملف"
          : stage === "preview"
            ? "معاينة"
            : stage === "upload"
              ? "رفع لتليجرام"
              : "تم",
  };
}

export function progressStatus(stage: Parameters<typeof stageProgress>[0], extra?: string): string {
  const p = stageProgress(stage);
  return `${p.bar} ${p.pct}%\n${p.label}${extra ? `\n${extra}` : ""}`;
}

export function looksLikeLiveStream(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    if (host.includes("twitch.tv") && !host.startsWith("clips.") && !path.includes("/clip/")) {
      if (!path.includes("/videos/") && !path.includes("/clip")) return true;
    }
    if (path.includes("/live") || u.searchParams.get("live") === "1") return true;
    return false;
  } catch {
    return false;
  }
}

export function isCopyrightError(raw: string): boolean {
  return /copyright|blocked in your country|uploader has not made|this video is not available|content id/i.test(raw);
}

export function isGoneError(raw: string): boolean {
  return /video is unavailable|has been removed|deleted|not exist|private video|account terminated/i.test(raw);
}

function urlHash(url: string): string {
  return createHash("sha256").update(url.trim()).digest("hex").slice(0, 32);
}

async function ensure(sql: Awaited<ReturnType<typeof getSql>>) {
  await sql`
    create table if not exists media_cache (
      url_hash text primary key,
      url text not null,
      payload jsonb not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists download_ratings (
      id bigserial primary key,
      tg_id text not null,
      url text not null,
      stars int not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists referrals (
      tg_id text primary key,
      code text not null unique,
      invited_by text,
      invites int not null default 0,
      bonus_downloads int not null default 0,
      affiliate_credit int not null default 0,
      trial_used boolean not null default false
    )
  `;
  await sql`
    create table if not exists dead_links (
      url text primary key,
      reason text,
      hits int not null default 1,
      last_seen timestamptz not null default now()
    )
  `;
  await sql`alter table download_jobs add column if not exists priority int not null default 0`;
}

export async function cachedExtract(url: string): Promise<ExtractResult | null> {
  const sql = await getSql();
  await ensure(sql);
  const hash = urlHash(url);
  const rows = await sql<{ payload: ExtractResult; created_at: string | Date }>`
    select payload, created_at from media_cache
    where url_hash = ${hash}
      and created_at > now() - interval '6 hours'
    limit 1
  `;
  return rows[0]?.payload ?? null;
}

export async function saveExtractCache(url: string, result: ExtractResult): Promise<void> {
  if (!result.items.length) return;
  const sql = await getSql();
  await ensure(sql);
  const hash = urlHash(url);
  const payload = JSON.stringify({
    platform: result.platform,
    id: result.id,
    title: result.title,
    author: result.author,
    text: result.text,
    sourceUrl: result.sourceUrl,
    items: result.items.slice(0, 3),
  });
  await sql`
    insert into media_cache (url_hash, url, payload)
    values (${hash}, ${url}, ${payload})
    on conflict (url_hash) do update set payload = excluded.payload, created_at = now()
  `.catch(() => undefined);
}

export async function recordDeadLink(url: string, reason: string): Promise<void> {
  const sql = await getSql();
  await ensure(sql);
  await sql`
    insert into dead_links (url, reason, hits, last_seen)
    values (${url.slice(0, 500)}, ${reason.slice(0, 180)}, 1, now())
    on conflict (url) do update set hits = dead_links.hits + 1, reason = excluded.reason, last_seen = now()
  `.catch(() => undefined);
}

export async function saveRating(tgId: number, url: string, stars: number): Promise<void> {
  const n = Math.min(5, Math.max(1, Math.trunc(stars)));
  const sql = await getSql();
  await ensure(sql);
  await sql`
    insert into download_ratings (tg_id, url, stars) values (${String(tgId)}, ${url.slice(0, 500)}, ${n})
  `.catch(() => undefined);
}

export function referralCode(tgId: number): string {
  return `b${tgId.toString(36)}`;
}

export async function ensureReferral(tgId: number): Promise<{ code: string; invites: number; bonus: number; trialUsed: boolean; credit: number }> {
  const sql = await getSql();
  await ensure(sql);
  const code = referralCode(tgId);
  await sql`
    insert into referrals (tg_id, code) values (${String(tgId)}, ${code})
    on conflict (tg_id) do nothing
  `;
  const rows = await sql<{ code: string; invites: number; bonus_downloads: number; trial_used: boolean; affiliate_credit: number }>`
    select code, invites, bonus_downloads, trial_used, affiliate_credit from referrals where tg_id = ${String(tgId)}
  `;
  const r = rows[0];
  return {
    code: r?.code ?? code,
    invites: r?.invites ?? 0,
    bonus: r?.bonus_downloads ?? 0,
    trialUsed: Boolean(r?.trial_used),
    credit: r?.affiliate_credit ?? 0,
  };
}

export async function applyReferral(newUserId: number, startArg: string): Promise<boolean> {
  const m = startArg.trim().match(/^ref[_-]?([a-z0-9]+)/i);
  if (!m) return false;
  const sql = await getSql();
  await ensure(sql);
  const rows = await sql<{ tg_id: string }>`select tg_id from referrals where code = ${m[1]!.toLowerCase()} limit 1`;
  const host = rows[0]?.tg_id;
  if (!host || host === String(newUserId)) return false;
  await ensureReferral(newUserId);
  const mine = await sql<{ invited_by: string | null }>`select invited_by from referrals where tg_id = ${String(newUserId)}`;
  if (mine[0]?.invited_by) return false;
  await sql`update referrals set invited_by = ${host} where tg_id = ${String(newUserId)}`;
  const hostNow = await sql<{ invites: number }>`
    update referrals
    set invites = invites + 1, bonus_downloads = bonus_downloads + 3, affiliate_credit = affiliate_credit + 10
    where tg_id = ${host}
    returning invites
  `;
  const invites = Number(hostNow[0]?.invites ?? 0);
  if (invites > 0 && invites % 5 === 0) {
    const { grantDays } = await import("./store.server");
    await grantDays(host, 7);
    await sql`update members set tier = 'pro' where tg_id = ${host}`.catch(() => undefined);
    const { telegram } = await import("./telegram.server");
    await telegram
      .sendMessage(Number(host), `دعوة ${invites} أشخاص ⚡️\nأسبوع برو مجاني انضاف لاشتراكك.`)
      .catch(() => undefined);
  }
  const { awardPoints } = await import("./points.server");
  await awardPoints(host, "invite").catch(() => undefined);
  return true;
}

export async function consumeBonusDownload(tgId: number): Promise<boolean> {
  const sql = await getSql();
  await ensure(sql);
  const rows = await sql<{ bonus_downloads: number }>`
    update referrals set bonus_downloads = bonus_downloads - 1
    where tg_id = ${String(tgId)} and bonus_downloads > 0
    returning bonus_downloads
  `;
  return Boolean(rows[0]);
}

export async function markTrialUsed(tgId: number): Promise<boolean> {
  const sql = await getSql();
  await ensure(sql);
  await ensureReferral(tgId);
  const rows = await sql<{ tg_id: string }>`
    update referrals set trial_used = true
    where tg_id = ${String(tgId)} and trial_used = false
    returning tg_id
  `;
  return Boolean(rows[0]);
}

export async function extraBlockKeywords(): Promise<string[]> {
  const { getSettings } = await import("./store.server");
  const raw = (await getSettings()).block_keywords ?? "";
  return String(raw)
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
    .slice(0, 40);
}

export async function analyticsReport(): Promise<string> {
  const sql = await getSql();
  const platforms = await sql<{ platform: string; c: number }>`
    select coalesce(platform, 'غير محدد') as platform, count(*)::int as c
    from download_logs where ok = true and created_at > now() - interval '7 days'
    group by 1 order by c desc limit 8
  `.catch(() => []);
  const hours = await sql<{ h: number; c: number }>`
    select extract(hour from timezone('Asia/Riyadh', created_at))::int as h, count(*)::int as c
    from download_logs where ok = true and created_at > now() - interval '7 days'
    group by 1 order by c desc limit 3
  `.catch(() => []);
  const members = await sql<{ c: number }>`
    select count(*)::int as c from members where created_at > now() - interval '7 days'
  `.catch(() => [{ c: 0 }]);
  const dead = await sql<{ c: number }>`select count(*)::int as c from dead_links`.catch(() => [{ c: 0 }]);
  const ratings = await sql<{ avg: number; c: number }>`
    select coalesce(avg(stars), 0)::float as avg, count(*)::int as c from download_ratings
    where created_at > now() - interval '7 days'
  `.catch(() => [{ avg: 0, c: 0 }]);
  const plat = platforms.map((p) => `• ${p.platform}: ${p.c}`).join("\n") || "لا بيانات بعد";
  const peak = hours.map((h) => `${h.h}:00 (${h.c})`).join(" · ") || "—";
  return [
    "تحليلات 7 أيام ⚡️",
    "",
    "المنصات:",
    plat,
    "",
    `الذروة (الرياض): ${peak}`,
    `أعضاء جدد: ${members[0]?.c ?? 0}`,
    `متوسط التقييم: ${(ratings[0]?.avg ?? 0).toFixed(1)} ★ (${ratings[0]?.c ?? 0})`,
    `روابط معطلة مرصودة: ${dead[0]?.c ?? 0}`,
    `حد المجاني: ${DAILY_CAP}/يوم`,
  ].join("\n");
}

export async function weeklyOwnerReport(): Promise<string> {
  return `${await analyticsReport()}\n\nالإيرادات: الاشتراكات غير مطلقة — لا نجوم محصّلة.\nالمشاكل: راجع «روابط معطلة» من اللوحة.`;
}

export function launchPlanText(): string {
  return `خطة إطلاق أسبوعية لـ @barq_all

اليوم 1: تعريف برق + فيديو تجريبي
اليوم 2: كيف تحمّل من تيك توك/إكس
اليوم 3: Barq AI بجملة واحدة
اليوم 4: مسابقة تحميل (زر شارك)
اليوم 5: خطط بلس/برو/ماكس (بدون دفع حتى الإطلاق)
اليوم 6: إحالة صديق = 3 تحميلات
اليوم 7: ملخص الأسبوع + موعد الإطلاق

لا تُنشر فواتير حتى تقول: اطلق.`;
}

export function shareUrl(sourceUrl: string, title?: string): string {
  return shareTargets(sourceUrl, title).telegram;
}

export function shareTargets(sourceUrl: string, title?: string): {
  telegram: string;
  whatsapp: string;
  x: string;
  facebook: string;
  snapchat: string;
} {
  const text = `برق ⚡️ ${title || ""}`.trim();
  const u = encodeURIComponent(sourceUrl);
  const t = encodeURIComponent(text);
  return {
    telegram: `https://t.me/share/url?url=${u}&text=${t}`,
    whatsapp: `https://api.whatsapp.com/send?text=${t}%20${u}`,
    x: `https://twitter.com/intent/tweet?url=${u}&text=${t}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    snapchat: `https://www.snapchat.com/scan?attachmentUrl=${u}`,
  };
}

export function previewCaption(result: ExtractResult): string {
  const item = result.items.find((i) => i.kind === "video" || i.kind === "audio") ?? result.items[0];
  const dur = item?.duration ? `${Math.round(item.duration)}ث` : "";
  const sizes = (item?.variants ?? []).map((v) => v.size).filter((n): n is number => typeof n === "number" && n > 0);
  const mb = sizes.length ? `${Math.round(Math.min(...sizes) / (1024 * 1024))}–${Math.round(Math.max(...sizes) / (1024 * 1024))}MB` : "";
  return ["جاري إرسال أعلى جودة", [dur, mb].filter(Boolean).join(" · ")].filter(Boolean).join("\n");
}

export function queueEta(position: number): string {
  const sec = Math.max(1, position) * 22;
  if (sec < 60) return `الوقت المتوقع ~${sec} ثانية`;
  return `الوقت المتوقع ~${Math.ceil(sec / 60)} دقيقة`;
}

export { progressBar };
