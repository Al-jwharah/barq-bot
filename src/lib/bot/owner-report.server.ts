/**
 * Daily usage report — sent to the OWNER only (never to users), once per ~day,
 * from the daily /api/keep cron. Opt-out from owner panel «الميزات» → تقرير يومي للمالك.
 */
import { OWNER_TG_ID } from "./config.server";

export type DailyNumbers = {
  members: number;
  newMembers: number;
  activeUsers: number;
  downloads: number;
  failed: number;
  blocked: number;
  topPlatforms: { platform: string; c: number }[];
};

export function reportText(n: DailyNumbers, day: string): string {
  const rate = n.downloads + n.failed > 0 ? Math.round((n.downloads / (n.downloads + n.failed)) * 100) : 100;
  const top = n.topPlatforms.length ? n.topPlatforms.map((p) => `${p.platform} ${p.c}`).join(" · ") : "—";
  return `تقرير برق اليومي ⚡️ ${day}

الأعضاء: ${n.members} (+${n.newMembers} جديد)
نشطون آخر 24 ساعة: ${n.activeUsers}
تحميلات ناجحة: ${n.downloads} · فشل: ${n.failed} · حجب: ${n.blocked}
نسبة النجاح: ${rate}%
أكثر المنصات: ${top}

لإيقاف التقرير: لوحة التحكم ← الميزات.`;
}

export async function dailyNumbers(): Promise<DailyNumbers> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const one = async (q: Promise<{ c: number }[]>) => Number((await q.catch(() => []))[0]?.c ?? 0);
  const [members, newMembers, activeUsers, downloads, failed, blocked] = await Promise.all([
    one(sql<{ c: number }>`select count(*)::int as c from members`),
    one(sql<{ c: number }>`select count(*)::int as c from members where created_at > now() - interval '24 hours'`),
    one(sql<{ c: number }>`select count(distinct tg_id)::int as c from download_logs where created_at > now() - interval '24 hours'`),
    one(sql<{ c: number }>`select count(*)::int as c from download_logs where ok = true and created_at > now() - interval '24 hours'`),
    one(sql<{ c: number }>`select count(*)::int as c from download_logs where ok = false and blocked = false and created_at > now() - interval '24 hours'`),
    one(sql<{ c: number }>`select count(*)::int as c from download_logs where blocked = true and created_at > now() - interval '24 hours'`),
  ]);
  const top = await sql<{ platform: string; c: number }>`
    select coalesce(platform, 'other') as platform, count(*)::int as c from download_logs
    where ok = true and created_at > now() - interval '24 hours'
    group by 1 order by 2 desc limit 3
  `.catch(() => []);
  return { members, newMembers, activeUsers, downloads, failed, blocked, topPlatforms: top.map((r) => ({ platform: r.platform, c: Number(r.c) })) };
}

/** Pure gate: flag on, a real owner id, and ≥20h since the last report. */
export function reportDue(flagOn: boolean, lastAt: number, now = Date.now(), ownerId = OWNER_TG_ID): boolean {
  if (!flagOn) return false;
  if (!/^\d{5,}$/.test(String(ownerId ?? ""))) return false;
  return !lastAt || now - lastAt >= 20 * 60 * 60_000;
}

export async function maybeSendOwnerReport(now = Date.now()): Promise<boolean> {
  const { featureOn } = await import("./features.server");
  const store = await import("./store.server");
  const flag = await featureOn("owner_report");
  const last = Number((await store.getSettings())["owner_report_at"] ?? 0);
  if (!reportDue(flag, last, now)) return false;
  await store.setSetting("owner_report_at", String(now));
  const { riyadhDay } = await import("./clock");
  const text = reportText(await dailyNumbers(), riyadhDay(now));
  const { telegram } = await import("./telegram.server");
  await telegram.sendMessage(Number(OWNER_TG_ID), text);
  return true;
}
