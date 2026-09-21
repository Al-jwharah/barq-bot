import { issueAccountLink } from "../account.server";
import { pointsBalance, REDEEM_COST } from "../points.server";
import { inlineKeyboard, telegram } from "../telegram.server";

export async function handleAccount(chatId: number, fromId: number) {
  try {
    const link = await issueAccountLink(fromId);
    await telegram.sendMessage(chatId, `حسابك على الويب (12 ساعة)\n${link}`, {
      reply_markup: inlineKeyboard([[{ text: "فتح حسابي", url: link }]]),
    });
  } catch {
    await telegram.sendMessage(chatId, "تعذر فتح الحساب الآن. جرّب سجلي من البوت.");
  }
}

export async function handlePoints(chatId: number, fromId: number) {
  const bal = await pointsBalance(fromId);
  await telegram.sendMessage(
    chatId,
    `Barq Points: ${bal}\nتحميل +1 · تقييم +5 · دعوة +20\n${REDEEM_COST} نقطة = 3 تحميلات.`,
    { reply_markup: inlineKeyboard([[{ text: "صرف 100 نقطة", callback_data: "pt:redeem" }]]) },
  );
}

export async function handleHistory(chatId: number, fromId: number) {
  const lib = await import("../library.server");
  if (typeof lib.listHistory !== "function") {
    await telegram.sendMessage(chatId, "سجلك فارغ.");
    return;
  }
  const rows = await lib.listHistory(fromId);
  if (!rows.length) {
    await telegram.sendMessage(chatId, "سجلك فارغ.");
    return;
  }
  const lines = rows.map((r, i) => `${i + 1}. ${(r.title || r.url).slice(0, 60)}`);
  const buttons = rows.slice(0, 8).map((r) => [
    { text: String((r.title || r.url).slice(0, 32)), callback_data: `h:${r.id}` },
  ]);
  await telegram.sendMessage(chatId, lines.join("\n"), {
    reply_markup: inlineKeyboard(buttons),
  });
}
