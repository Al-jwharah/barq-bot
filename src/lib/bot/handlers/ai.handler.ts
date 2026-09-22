import { creatorStudio } from "../studio.server";
import { analyzeClip } from "../analyze.server";
import { keysFor } from "../keyboard";
import { telegram } from "../telegram.server";
import type { Member } from "../store.server";
import { summarizeLastClip } from "../ai/summarize";
import { generateSmartCaption, type CaptionTone } from "../ai/captions";
import { suggestSmartClips } from "../ai/smart-clips";
import {
  runSubtitlesPipeline,
  toggleSubtitlesOptIn,
  isSubtitlesOptedIn,
} from "../ai/subtitles";

export async function handleAnalyze(chatId: number, fromId: number, member: Member) {
  const text = await analyzeClip(fromId);
  await telegram.sendMessage(chatId, text.slice(0, 3500), { reply_markup: await keysFor(fromId, member) });
}

export async function handleStudio(chatId: number, fromId: number, member: Member) {
  const text = await creatorStudio(fromId);
  await telegram.sendMessage(chatId, text.slice(0, 3500), { reply_markup: await keysFor(fromId, member) });
}

export async function handleSummarize(chatId: number, fromId: number, member: Member) {
  const text = await summarizeLastClip(fromId);
  await telegram.sendMessage(chatId, text.slice(0, 3500), { reply_markup: await keysFor(fromId, member) });
}

export async function handleSmartCaption(
  chatId: number,
  fromId: number,
  member: Member,
  tone: CaptionTone,
) {
  const { text } = await generateSmartCaption(fromId, tone);
  await telegram.sendMessage(chatId, text.slice(0, 3500), { reply_markup: await keysFor(fromId, member) });
}

export async function handleSmartClips(chatId: number, fromId: number, member: Member) {
  const text = await suggestSmartClips(fromId);
  await telegram.sendMessage(chatId, text.slice(0, 3500), { reply_markup: await keysFor(fromId, member) });
}

export async function handleSubtitles(chatId: number, fromId: number, member: Member) {
  const result = await runSubtitlesPipeline(fromId);
  if (!result.optedIn) {
    const { inlineKeyboard } = await import("../telegram.server");
    const { SUBTITLES_TOGGLE_CALLBACK } = await import("../ai/subtitles");
    await telegram.sendMessage(chatId, result.message.slice(0, 3500), {
      reply_markup: inlineKeyboard([
        [{ text: "تفعيل الترجمة", callback_data: SUBTITLES_TOGGLE_CALLBACK }],
      ]),
    });
    return;
  }
  await telegram.sendMessage(chatId, result.message.slice(0, 3500), {
    reply_markup: await keysFor(fromId, member),
  });
}

export async function handleSubtitlesToggle(chatId: number, fromId: number, member: Member) {
  const on = toggleSubtitlesOptIn(fromId);
  const note = on
    ? "تم تفعيل الترجمة الاختيارية. اضغط «ترجمة اختيارية» مرة أخرى لمسودة SRT."
    : "أُلغيت الترجمة الاختيارية.";
  await telegram.sendMessage(
    chatId,
    `${note}\nالحالة: ${isSubtitlesOptedIn(fromId) ? "مفعّل" : "إيقاف"}`,
    { reply_markup: await keysFor(fromId, member) },
  );
}
