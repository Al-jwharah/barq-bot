/**
 * Squad B — Engagement & Growth pure helpers.
 * B3/B4 live switches live in config.server (default OFF until 48h stable).
 */

import { DAILY_CAP } from "./config.server";
import { MULTI_LINK_CAP } from "./handle-guards";

/** Visual batch card: done=🟢 active=🟡 pending=⚪ */
export function batchProgressCard(done: number, active: number, total: number): string {
  const n = Math.max(0, Math.trunc(total));
  if (n === 0) return "";
  const d = Math.max(0, Math.trunc(done));
  const a = Math.max(0, Math.trunc(active));
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    if (i < d) parts.push("🟢");
    else if (i === a) parts.push("🟡");
    else parts.push("⚪");
  }
  return parts.join("");
}

/** Status text while enqueueing a multi-link batch. */
export function multiLinkProgressText(opts: {
  total: number;
  active: number;
  done: number;
  cap?: number;
}): string {
  const cap = opts.cap ?? MULTI_LINK_CAP;
  const limit = Math.min(Math.max(1, Math.trunc(opts.total)), Math.max(1, Math.trunc(cap)));
  const done = Math.max(0, Math.min(Math.trunc(opts.done), limit));
  const active = Math.max(0, Math.min(Math.trunc(opts.active), Math.max(0, limit - 1)));
  const card = batchProgressCard(done, active, limit);
  const skipped = opts.total > cap ? `\nأخذت أول ${cap} فقط.` : "";
  return `دفعة التحميل ⚡️ ${done}/${limit}\n${card}${skipped}`;
}

/** Proactive daily-limit warn when user hits #4 of 5 (cap − 1). */
export function shouldWarnDailyLimit(count: number, cap = DAILY_CAP): boolean {
  if (!Number.isFinite(count) || !Number.isFinite(cap) || cap < 2) return false;
  return count === cap - 1;
}

export function dailyLimitWarningText(count: number, cap = DAILY_CAP): string {
  const left = Math.max(0, cap - count);
  return `تنبيه الحد اليومي ⚡️\nاستخدمت ${count} من ${cap} اليوم.\nيتبقى ${left} تحميل قبل منتصف الليل (توقيت الرياض).`;
}

/** Journey ("رحلتك") header with consecutive-day streak. */
export function journeyStreakLine(streak: number, best: number): string {
  const s = Math.max(0, Math.trunc(streak));
  const b = Math.max(0, Math.trunc(best));
  if (s <= 0) return "سلسلتك: ابدأ يومك الأول ⚡️";
  return `سلسلتك: ${s} يوم متتالي 🔥 (أفضل ${b})`;
}

export function referralsGatedMessage(): string {
  return [
    "نظام الدعوات جاهز بالكود ⚡️",
    "غير مفعّل للإنتاج بعد (BARQ_REFERRALS_LIVE=off).",
    "يُفعَّل بعد تقرير Squad C: 48 ساعة بلا أعطال جديدة.",
  ].join("\n");
}

export function leaderboardGatedMessage(): string {
  return [
    "لوحة المتصدرين الأسبوعية جاهزة بالكود ⚡️",
    "غير مفعّلة للإنتاج بعد (BARQ_LEADERBOARD_LIVE=off).",
    "يُفعَّل بعد تقرير Squad C: 48 ساعة بلا أعطال جديدة.",
  ].join("\n");
}

/** Library aliases for My Library button access. */
export function isLibraryCommand(text: string): boolean {
  const t = text.trim();
  return (
    t === "سجلي" ||
    t === "سجليّ" ||
    t === "مكتبتي" ||
    t === "مكتبتيّ" ||
    t === "سجل التحميل" ||
    t.startsWith("/history") ||
    t.startsWith("/library") ||
    t.startsWith("/lib")
  );
}

export function isJourneyCommand(text: string): boolean {
  const t = text.trim();
  return t === "رحلتي" || t === "رحلتك" || t.startsWith("/journey");
}

export function isLeaderboardCommand(text: string): boolean {
  const t = text.trim();
  return (
    t === "المتصدرين" ||
    t === "لوحة المتصدرين" ||
    t === "موصى به" ||
    t.startsWith("/top") ||
    t.startsWith("/leaderboard") ||
    t.startsWith("/lb")
  );
}
