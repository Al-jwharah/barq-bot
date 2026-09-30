/**
 * Inline mode (@bot <link> in any chat). Behind owner flag «الوضع المضمّن».
 * Only already-delivered, already-policy-checked files are offered (Telegram file cache),
 * plus an "open in Barq" card — no heavy download inside the 10s inline window.
 */
import { BOT_USERNAME } from "./config.server";
import { telegram } from "./telegram.server";

export type TgInlineQuery = { id: string; from: { id: number }; query: string };

export function inlineUrl(query: string): string | null {
  const m = query.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.]+$/g, "") : null;
}

export function inlineResults(url: string | null, cached: { fileId: string; kind: string } | null, bot = BOT_USERNAME) {
  const open = {
    type: "article",
    id: "open",
    title: "حمّل عبر برق ⚡️",
    description: url ? url.slice(0, 120) : "الصق رابط المقطع بعد اسم البوت",
    input_message_content: { message_text: url ? `⚡️ ${url}` : `⚡️ @${bot}` },
    reply_markup: { inline_keyboard: [[{ text: "⚡️ افتح برق", url: `https://t.me/${bot}` }]] },
  };
  if (!url) return [open];
  const results: Record<string, unknown>[] = [];
  if (cached?.fileId && cached.kind === "video") {
    results.push({ type: "video", id: "v", video_file_id: cached.fileId, title: "إرسال المقطع ⚡️", caption: `⚡️ @${bot}` });
  }
  results.push(open);
  return results;
}

export async function handleInlineQuery(q: TgInlineQuery): Promise<void> {
  const { featureOn } = await import("./features.server");
  const answer = (results: Record<string, unknown>[]) =>
    telegram.answerInlineQuery(q.id, results, { cache_time: 30, is_personal: true }).catch(() => undefined);
  if (!(await featureOn("inline"))) {
    await answer([]);
    return;
  }
  const { getMember } = await import("./store.server");
  let member: Awaited<ReturnType<typeof getMember>> | null;
  try {
    member = await getMember(q.from.id);
  } catch {
    await answer([]);
    return;
  }
  if (member?.is_banned) {
    await answer([]);
    return;
  }
  const url = inlineUrl(q.query ?? "");
  if (url) {
    try {
      const { assertPublicHttpUrl } = await import("../media/ssrf");
      const { assertPreExtractBlocklist } = await import("./safety");
      assertPublicHttpUrl(url);
      assertPreExtractBlocklist(url);
    } catch {
      await answer([]);
      return;
    }
  }
  const { cachedTelegramFile } = await import("./file-cache.server");
  const cached = url ? await cachedTelegramFile(url) : null;
  await answer(inlineResults(url, cached));
}
