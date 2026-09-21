import { creatorStudio } from "../studio.server";
import { analyzeClip } from "../analyze.server";
import { keysFor } from "../keyboard";
import { telegram } from "../telegram.server";
import type { Member } from "../store.server";

export async function handleAnalyze(chatId: number, fromId: number, member: Member) {
  const text = await analyzeClip(fromId);
  await telegram.sendMessage(chatId, text.slice(0, 3500), { reply_markup: await keysFor(fromId, member) });
}

export async function handleStudio(chatId: number, fromId: number, member: Member) {
  const text = await creatorStudio(fromId);
  await telegram.sendMessage(chatId, text.slice(0, 3500), { reply_markup: await keysFor(fromId, member) });
}
