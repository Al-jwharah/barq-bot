import { GROK_KEYBOARD, OWNER_KEYBOARD } from "./owner-panel.server";
import { inGrokMode } from "./session.server";
import { getMember, isSubscribed, type Member } from "./store.server";
import { isOwnerId } from "./config.server";
import { replyKeyboard } from "./telegram.server";

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

export const SUB_KEYBOARD = replyKeyboard([
  ["🔗 رابط مؤقت"],
  ["لخّصه", "كابشن"],
  ["حالة الاشتراك", SUPPORT_BTN],
]);

export function subKeyboard() {
  return SUB_KEYBOARD;
}

export const FREE_KEYBOARD = replyKeyboard([
  ["⚡ حمّل رابط", "🔖 محفوظاتي"],
  ["🔗 رابط مؤقت"],
  ["❔ المساعدة"],
]);

/** Kept for v2 callers — the simple keyboard is the product default now. */
export function freeKeyboardFull() {
  return FREE_KEYBOARD;
}

export const FREE_KEYBOARD_FULL = FREE_KEYBOARD;

export type UserRole = "owner" | "admin" | "moderator" | "support" | "sub" | "free";

export function roleOf(fromId: number, member?: Member | null): UserRole {
  if (isOwnerId(fromId)) return "owner";
  const stored = (member?.role ?? (member?.is_admin ? "admin" : "")).toLowerCase();
  if (stored === "admin" || stored === "moderator" || stored === "support") return stored;
  if (member && isSubscribed(member)) return "sub";
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
  if (role === "moderator") {
    return replyKeyboard([
      ["البلاغات", "تذاكر الدعم"],
      ["المهام", "مراقبة"],
      ["كيف يعمل"],
    ]);
  }
  if (role === "support") return replyKeyboard([["/tickets", "كيف يعمل"]]);
  if (role === "sub") return SUB_KEYBOARD;
  return freeKeyboardFor(resolved);
}
