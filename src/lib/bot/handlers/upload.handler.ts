import { fileFromMessage, hostTelegramFile } from "../host.server";
import { dropReadyText, type DropHours } from "../drop.server";
import { inlineKeyboard, telegram, type TgMessage } from "../telegram.server";
import { getPublicOrigin, requirePublicOrigin } from "../origin";

async function clipOrigin(): Promise<string> {
  const origin = getPublicOrigin();
  if (origin) return origin;
  try {
    return requirePublicOrigin();
  } catch {
    return "";
  }
}

export async function handleUpload(
  chatId: number,
  fromId: number,
  msg: TgMessage,
  hours: DropHours = 24,
): Promise<boolean> {
  const file = fileFromMessage(msg);
  if (!file) return false;
  const status = await telegram.sendMessage(chatId, `⚡️ أرفع الملف · ${hours} ساعة`);
  try {
    const hosted = await hostTelegramFile({ ...file, tgId: fromId, hours });
    const origin = await clipOrigin();
    const direct = `${origin}/d/${hosted.id}`;
    await telegram.deleteMessage(chatId, status.message_id).catch(() => undefined);
    await telegram.sendMessage(chatId, dropReadyText(hours, direct), {
      reply_markup: inlineKeyboard([[{ text: "فتح الرابط", url: direct }]]),
    });
  } catch (err) {
    await telegram
      .editMessageText(chatId, status.message_id, err instanceof Error ? err.message : "تعذر رفع الملف")
      .catch(() => undefined);
  }
  return true;
}
