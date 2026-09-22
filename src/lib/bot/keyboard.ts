import { GROK_KEYBOARD, OWNER_KEYBOARD } from "./owner-panel.server";
import { inGrokMode } from "./session.server";
import { getMember, type Member } from "./store.server";
import { isOwnerId } from "./config.server";
import { replyKeyboard } from "./telegram.server";
import { SHORT_LINK_BTN } from "./short-intent";
import { shortLinksAdvertised } from "./blob-status.server";

export const AD_BTN = "مشاهدة إعلان لتجديد 10 فيديوهات";
export const SUPPORT_BTN = "دعم فني";

export const OWNER_ONLY_LABELS = new Set([
  "لوحة التحكم",
  "برق AI",
  "المراقبة",
  "الإحصائيات",
  "إرسال للجميع",
  "النظام",
  "القناة والمجاني",
  "أخبار القناة",
  "الإعلان",
  "إنهاء برق AI",
  "إنهاء المحادثة",
  "النماذج",
  "انشر في القناة",
  "اسحب فائز",
]);

export function subKeyboard() {
  const top = shortLinksAdvertised()
    ? [SHORT_LINK_BTN, "حالة الاشتراك"]
    : ["حالة الاشتراك"];
  return replyKeyboard([top, ["كيف يعمل", SUPPORT_BTN]]);
}

export const SUB_KEYBOARD = subKeyboard();

/** First-contact keyboard: paste-link UX, no points/journey wall of buttons. */
export const FREE_KEYBOARD = replyKeyboard([["كيف يعمل", SUPPORT_BTN]]);

/** Unlocked after first successful download — points / journey / achievements. */
export function freeKeyboardFull() {
  const rows: string[][] = [];
  if (shortLinksAdvertised()) rows.push([SHORT_LINK_BTN, "سجلي"]);
  else rows.push(["سجلي"]);
  rows.push(["حدّي", "برق AI"], ["رحلتي", "إنجازاتي"], ["أعجبني", "حسابي"], ["نقاطي", "كيف يعمل"]);
  return replyKeyboard(rows);
}

export const FREE_KEYBOARD_FULL = freeKeyboardFull();

export type UserRole = "owner" | "admin" | "moderator" | "support" | "sub" | "free";

export function roleOf(fromId: number, member?: Member | null): UserRole {
  if (isOwnerId(fromId)) return "owner";
  const stored = (member?.role ?? (member?.is_admin ? "admin" : "")).toLowerCase();
  if (stored === "admin" || stored === "moderator" || stored === "support") return stored;
  return "free";
}

export function freeKeyboardFor(member?: Member | null) {
  if ((member?.downloads_used ?? 0) > 0) return freeKeyboardFull();
  return FREE_KEYBOARD;
}

export async function keysFor(fromId: number, member?: Member | null) {
  const resolved = member ?? (await getMember(fromId));
  const role = roleOf(fromId, resolved);
  if (role === "owner" && inGrokMode(fromId)) return GROK_KEYBOARD;
  if (role === "owner") return OWNER_KEYBOARD;
  if (role === "admin") return replyKeyboard([["لوحة التحكم", "/jobs"], ["/tickets", "كيف يعمل"]]);
  if (role === "moderator") return replyKeyboard([["/reports", "/block"], ["كيف يعمل"]]);
  if (role === "support") return replyKeyboard([["/tickets", "كيف يعمل"]]);
  return freeKeyboardFor(resolved);
}
