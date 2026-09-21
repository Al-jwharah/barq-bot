import { fileFromMessage, hostTelegramFile } from "../host.server";
import { setLastClip } from "../session.server";
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

export async function handleUpload(chatId: number, fromId: number, msg: TgMessage): Promise<boolean> {
  const file = fileFromMessage(msg);
  if (!file) return false;
  const status = await telegram.sendMessage(chatId, "رفع الملف…");
  try {
    const hosted = await hostTelegramFile({ ...file, tgId: fromId });
    const origin = await clipOrigin();
    const direct = `${origin}/d/${hosted.id}`;
    setLastClip(fromId, { url: direct, mediaUrl: "", kind: file.kind, platform: "upload" });
    const kindLabel =
      file.kind === "photo" ? "صورة" : file.kind === "video" ? "فيديو" : file.kind === "app" ? "تطبيق" : "ملف";
    await telegram.deleteMessage(chatId, status.message_id).catch(() => undefined);
    await telegram.sendMessage(
      chatId,
      `رابط مباشر لمدة 24 ساعة\n${kindLabel} · يفتح الملف نفسه ثم يختفي\n\n${direct}`,
      { reply_markup: inlineKeyboard([[{ text: "فتح الرابط", url: direct }]]) },
    );
    const { archiveDelivered } = await import("../vault.server");
    await archiveDelivered({
      fromChatId: chatId,
      messageIds: [msg.message_id],
      sourceUrl: direct,
      who: { id: fromId },
    }).catch(() => undefined);
  } catch (err) {
    await telegram
      .editMessageText(chatId, status.message_id, err instanceof Error ? err.message : "تعذر رفع الملف")
      .catch(() => undefined);
  }
  return true;
}
