import { GROK_KEYBOARD, OWNER_KEYBOARD } from "./owner-panel.server";
import { inGrokMode } from "./session.server";
import { getMember, type Member } from "./store.server";
import { isOwnerId } from "./config.server";
import { replyKeyboard } from "./telegram.server";

export const AD_BTN = "مشاهدة إعلان لتجديد 5 فيديوهات";
export const SUPPORT_BTN = "دعم فني";

export const OWNER_ONLY_LABELS = new Set([
  "لوحة التحكم",
  "Barq AI",
  "المراقبة",
  "الإحصائيات",
  "إرسال للجميع",
  "النظام",
  "القناة والمجاني",
  "أخبار القناة",
  "الإعلان",
  "إنهاء Barq AI",
  "إنهاء المحادثة",
  "النماذج",
  "انشر في القناة",
  "اسحب فائز",
]);

export const SUB_KEYBOARD = replyKeyboard([
  ["رابط مؤقت", "حالة الاشتراك"],
  ["كيف يعمل", SUPPORT_BTN],
]);

export const FREE_KEYBOARD = replyKeyboard([
  ["رابط مؤقت", "سجلي"],
  ["حدّي", "Barq AI"],
  ["رحلتي", "إنجازاتي"],
  ["أعجبني", "حسابي"],
  ["نقاطي", "كيف يعمل"],
]);

export type UserRole = "owner" | "admin" | "moderator" | "support" | "sub" | "free";

export function roleOf(fromId: number, member?: Member | null): UserRole {
  if (isOwnerId(fromId)) return "owner";
  const stored = (member?.role ?? (member?.is_admin ? "admin" : "")).toLowerCase();
  if (stored === "admin" || stored === "moderator" || stored === "support") return stored;
  return "free";
}

export async function keysFor(fromId: number, member?: Member | null) {
  const role = roleOf(fromId, member ?? (await getMember(fromId)));
  if (role === "owner" && inGrokMode(fromId)) return GROK_KEYBOARD;
  if (role === "owner") return OWNER_KEYBOARD;
  if (role === "admin") return replyKeyboard([["لوحة التحكم", "/jobs"], ["/tickets", "كيف يعمل"]]);
  if (role === "moderator") return replyKeyboard([["/reports", "/block"], ["كيف يعمل"]]);
  if (role === "support") return replyKeyboard([["/tickets", "كيف يعمل"]]);
  return FREE_KEYBOARD;
}
