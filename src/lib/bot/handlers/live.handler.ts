import { followLive, listFollows, liveHelp, parseLiveTarget } from "../live.server";
import { keysFor } from "../keyboard";
import { telegram } from "../telegram.server";
import type { Member } from "../store.server";

export async function handleLive(chatId: number, fromId: number, text: string, member: Member) {
  const rest = text.replace(/^\/live(?:@\w+)?/i, "").replace(/^(البث|Live Recorder)/, "").trim();
  if (!rest) {
    await telegram.sendMessage(chatId, `${liveHelp()}\n\nمتابعاتك:\n${await listFollows(fromId)}`);
    return;
  }
  const target = parseLiveTarget(text);
  if (!target) {
    await telegram.sendMessage(chatId, liveHelp());
    return;
  }
  await telegram.sendMessage(chatId, await followLive(fromId, target), {
    reply_markup: await keysFor(fromId, member),
  });
}
