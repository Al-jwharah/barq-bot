import { getSettings, setSetting } from "./store.server";
import { telegram } from "./telegram.server";

export function planNotice(days: number): string {
  const span = days >= 300 ? "سنة كاملة" : `${days} يوم`;
  return `برق ⚡️

باقتك تفعّلت

برق ماكس · ${span}
يوتيوب · برق AI · أولوية التحميل

الصق أي رابط وابدأ.`;
}

export function moderatorNotice(): string {
  return `برق ⚡️

صرت مشرفًا في برق

تراجع البلاغات وتوقف المحتوى المخالف.
أرسل /start لتظهر أدوات المشرف.`;
}

export async function notifyUser(tgId: number | string, text: string): Promise<void> {
  const id = Number(tgId);
  if (!Number.isFinite(id) || id <= 0) return;
  await telegram.sendMessage(id, text).catch(() => undefined);
}

export async function notifyOnce(key: string, tgId: string, text: string): Promise<void> {
  const saved = (await getSettings().catch(() => ({}) as Record<string, string>))[key];
  if (saved === "sent") return;
  const id = Number(tgId);
  if (!Number.isFinite(id) || id <= 0) return;
  await telegram.sendMessage(id, text);
  await setSetting(key, "sent");
}
