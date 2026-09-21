import { BOT_USERNAME, DISCOUNT_CODE, SUB_SAR, SUPPORT_USERNAME } from "./config.server";
import { botDeepLink, TRY_BOT_LABEL } from "./brand";
import { inlineKeyboard, telegram } from "./telegram.server";

export const LAUNCH_TEXT = `تحديث برق ⚡️

حمّل أي فيديو بضغطة — يوتيوب، تيك توك، إنستغرام، إكس، فيسبوك، وأي رابط.

الميزات
• أعلى جودة متاحة
• الملف يصلك بتوقيع نظيف
• بعد الرابط: يصلك الملف بأعلى جودة
• 5 تجارب مجانية بعد الانضمام إلى @barq_all
• شاهد إعلانًا وجدّد 5 فيديوهات
• اشتراك ${SUB_SAR} ريال — تحميل بلا حدود

عرض اليوم
كود ${DISCOUNT_CODE} — شهر كامل عند التفعيل

البوت: @${BOT_USERNAME}
الدعم: @${SUPPORT_USERNAME}`;

export function launchMarkup() {
  return inlineKeyboard([
    [{ text: TRY_BOT_LABEL, url: botDeepLink(BOT_USERNAME, "try") }],
    [{ text: "قناة التحديثات", url: "https://t.me/barq_all" }],
  ]);
}

export async function postLaunchToChannel(pin = true): Promise<number> {
  const { resolveArchiveDest, rememberVaultChat } = await import("./vault.server");
  const chat = await resolveArchiveDest();
  const sent = await telegram.sendMessage(chat, LAUNCH_TEXT, {
    disable_web_page_preview: true,
    reply_markup: launchMarkup(),
  });
  if (sent?.chat?.id) await rememberVaultChat(sent.chat.id, sent.chat.title);
  if (pin) {
    await telegram.pinChatMessage(chat, sent.message_id, true).catch(() => undefined);
  }
  return sent.message_id;
}

export async function sendLaunchToMembers(): Promise<{ sent: number; total: number; skipped?: string }> {
  return { sent: 0, total: 0, skipped: "channel-only" };
}
