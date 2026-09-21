import {
  BOT_USERNAME,
  CHANNEL_CHAT,
  CHANNEL_DESCRIPTION,
  CHANNEL_TITLE,
  CHANNEL_USERNAME,
  OWNER_TG_ID,
  SUPPORT_URL,
} from "./config.server";
import { botDeepLink, TRY_BOT_LABEL } from "./brand";
import { lastOwnerMedia } from "./session.server";
import {
  contestEntryCount,
  createContest,
  drawContestWinners,
  enterContest,
  getContest,
  getSettings,
  latestOpenContest,
  listContests,
  setContestMessage,
  setSetting,
} from "./store.server";
import { inlineKeyboard, telegram } from "./telegram.server";

export function channelHubMarkup(extra: { contestId?: string } = {}) {
  const rows = [];
  if (extra.contestId) {
    rows.push([{ text: "أشارك ⚡", callback_data: `ct:e:${extra.contestId}` }]);
  }
  rows.push([{ text: TRY_BOT_LABEL, url: botDeepLink(BOT_USERNAME, "channel") }]);
  rows.push([{ text: "الدعم الفني", url: SUPPORT_URL }]);
  return inlineKeyboard(rows);
}

export const RELEASE_NOTES_V14 = `تم إصلاح تحميل تيك توك (روابط vt.tiktok.com القصيرة).
أرسل الرابط من جديد واستلم المقطع.

كذلك في هذا الإصدار:
• حد 5 مقاطع يوميًا بتوقيت الرياض (يتجدد منتصف الليل)
• حدود عادلة: 8 رسائل/دقيقة و20 رابط/ساعة
• Barq AI: 10 رسائل يوميًا للجميع
• خصم الرصيد مرة واحدة مع استرجاعه إذا فشل النظام
• حماية الروابط المختصرة وأرشفة التحميلات

البوت مجاني. للدعم @i_2169`;

const NEWS_ADMIN_HINT =
  "أضف @barq_ibot مشرفًا في قناة التحديثات ثم اكتب: انشر التحديث";

const NEWS_FAIL_OWNER =
  "تعذر النشر في @barq_all. حُفظ التحديث في الانتظار. التحميلات تعمل بشكل طبيعي.";

export async function rememberNewsChat(chatId: number | string, title?: string) {
  await setSetting("news_chat_id", String(chatId));
  if (title) await setSetting("news_title", title);
}

export function isNewsChannel(chat: { username?: string; title?: string } | null | undefined): boolean {
  const user = (chat?.username || "").replace(/^@/, "").toLowerCase();
  if (user === CHANNEL_USERNAME || user === "barq_news" || user === "barqupdates") return true;
  const title = (chat?.title || "").toLowerCase();
  return title.includes("التحديثات");
}

async function queueNewsText(body: string): Promise<void> {
  await setSetting("pending_news_text", body).catch(() => undefined);
}

async function clearQueuedNews(): Promise<void> {
  await setSetting("pending_news_text", "").catch(() => undefined);
}

async function rememberPostedMessage(messageId: number): Promise<void> {
  await setSetting("news_last_message_id", String(messageId)).catch(() => undefined);
}

/** Owner notice only. Never throws — news failure must not block downloads. */
async function notifyOwnerNewsError(reason: string): Promise<void> {
  const extra = reason.trim().slice(0, 500);
  const text = extra && extra !== NEWS_FAIL_OWNER ? `${NEWS_FAIL_OWNER}\n${extra}` : NEWS_FAIL_OWNER;
  await telegram.sendMessage(Number(OWNER_TG_ID), text).catch(() => undefined);
}

async function destChat(): Promise<string> {
  const s = await getSettings().catch(() => ({}) as Record<string, string>);
  const saved = s.news_chat_id?.trim();
  const ids = [CHANNEL_CHAT, saved].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);
  let lastErr = "البوت ليس مشرفًا في @barq_all";
  for (const id of ids) {
    try {
      const chat = await telegram.getChat(id);
      if (chat?.id) {
        await rememberNewsChat(chat.id, chat.title);
        return String(chat.id);
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : lastErr;
    }
  }
  throw new Error(`أضف @${BOT_USERNAME} مشرفًا في @${CHANNEL_USERNAME} ثم أعد النشر. ${lastErr}`);
}

export async function newsPublishStatus(): Promise<{ ok: boolean; posted: boolean; reason: string }> {
  const fail = { ok: false, posted: false, reason: NEWS_ADMIN_HINT };
  try {
    const s = await getSettings().catch(() => ({}) as Record<string, string>);
    const posted = Boolean(s.news_last_message_id?.trim());
    const chat = await telegram.getChat(CHANNEL_CHAT);
    if (!chat?.id) return fail;
    const me = await telegram.getMe().catch(() => null);
    if (me?.id) {
      try {
        const member = await telegram.getChatMember(chat.id, me.id);
        if (!["administrator", "creator"].includes(member.status)) return { ...fail, posted };
      } catch {
        return { ...fail, posted };
      }
    }
    return { ok: true, posted, reason: posted ? "" : NEWS_ADMIN_HINT };
  } catch {
    return fail;
  }
}

export async function syncChannelIdentity() {
  const chat = await destChat();
  await telegram.setChatTitle(chat, CHANNEL_TITLE).catch(() => undefined);
  await telegram.setChatDescription(chat, CHANNEL_DESCRIPTION).catch(() => undefined);
}

export async function postChannelText(
  text: string,
  opts: { pin?: boolean; contestId?: string } = {},
): Promise<{ messageId: number }> {
  const body = text.trim().slice(0, 3900);
  if (!body) throw new Error("النص فارغ");
  await queueNewsText(body);
  try {
    const chat = await destChat();
    const sent = await telegram.sendMessage(chat, body, {
      disable_web_page_preview: true,
      reply_markup: channelHubMarkup({ contestId: opts.contestId }),
    });
    if (!sent?.message_id) throw new Error(NEWS_ADMIN_HINT);
    if (sent.chat?.id) await rememberNewsChat(sent.chat.id, sent.chat.title);
    await rememberPostedMessage(sent.message_id);
    await clearQueuedNews();
    if (opts.pin) {
      await telegram.pinChatMessage(chat, sent.message_id, true).catch(() => undefined);
    }
    return { messageId: sent.message_id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : NEWS_ADMIN_HINT;
    await notifyOwnerNewsError(reason);
    throw err instanceof Error ? err : new Error(reason);
  }
}

export async function postNews(text: string, pin = false): Promise<{ messageId: number } | null> {
  try {
    const body = `⚡ تحديث برق

${text.trim()}

البوت: @${BOT_USERNAME}`;
    return await postChannelText(body, { pin });
  } catch {
    return null;
  }
}

export async function postUpdate(text: string, pin = false): Promise<{ messageId: number } | null> {
  try {
    const body = `📢 خبر برق

${text.trim()}

البوت: @${BOT_USERNAME}`;
    return await postChannelText(body, { pin });
  } catch {
    return null;
  }
}

export async function flushPendingNews(): Promise<{ messageId: number } | null> {
  const s = await getSettings().catch(() => ({}) as Record<string, string>);
  const pending = s.pending_news_text?.trim();
  if (!pending) return null;
  try {
    return await postChannelText(pending);
  } catch {
    return null;
  }
}

export async function startContest(input: {
  title: string;
  prize: string;
  rules?: string;
  winnersCount?: number;
  grantDays?: number;
}) {
  const title = input.title.trim().slice(0, 180);
  const prize = input.prize.trim().slice(0, 180) || "جائزة برق";
  if (!title) throw new Error("عنوان المسابقة مطلوب");
  const contest = await createContest({
    title,
    prize,
    rules: input.rules,
    winnersCount: input.winnersCount,
    grantDays: input.grantDays,
  });
  const rules = (input.rules ?? "").trim();
  const body = `🏆 مسابقة برق

${title}

الجائزة: ${prize}
الفائزون: ${contest.winners_count}${contest.grant_days ? ` · اشتراك ${contest.grant_days} يوم` : ""}
${rules ? `\n${rules}\n` : ""}
اضغط «أشارك ⚡» للدخول في السحب.
يجب أن تكون مشتركًا في القناة.`;
  const posted = await postChannelText(body, { contestId: contest.id });
  await setContestMessage(contest.id, posted.messageId);
  return { ...contest, messageId: posted.messageId };
}

export async function joinContest(
  contestId: string,
  tgId: number,
  username?: string,
  firstName?: string,
) {
  const result = await enterContest(contestId, tgId, username, firstName);
  const count = result.ok || result.already ? await contestEntryCount(contestId) : 0;
  return { ...result, count };
}

export async function drawContest(contestId?: string) {
  const contest = contestId ? await getContest(contestId) : await latestOpenContest();
  if (!contest) throw new Error("لا توجد مسابقة مفتوحة");
  const { winners } = await drawContestWinners(contest.id);
  const lines = winners.map((w, i) => {
    const who = w.username ? `@${w.username}` : w.first_name || w.tg_id;
    return `${i + 1}. ${who}`;
  });
  const body = winners.length
    ? `🏆 نتائج مسابقة «${contest.title}»

الفائزون:
${lines.join("\n")}

الجائزة: ${contest.prize}

مبروك! تواصل مع الدعم إن لزم.`
    : `أُغلقت مسابقة «${contest.title}» بدون مشاركين.`;
  const posted = await postChannelText(body);
  if (contest.grant_days > 0) {
    const { grantDays } = await import("./store.server");
    for (const w of winners) {
      await grantDays(w.tg_id, contest.grant_days).catch(() => undefined);
    }
  }
  return {
    contestId: contest.id,
    title: contest.title,
    winners,
    messageId: posted.messageId,
    grantedDays: contest.grant_days,
  };
}

export async function copyOwnerMediaToChannel(caption?: string) {
  const media = lastOwnerMedia();
  if (!media) throw new Error("لا توجد وسائط أخيرة من المالك. أرسل صورة أو فيديو ثم قل انشر.");
  const extra: Record<string, unknown> = {
    reply_markup: channelHubMarkup(),
  };
  if (caption?.trim()) extra.caption = caption.trim().slice(0, 1000);
  try {
    const chat = await destChat();
    const sent = await telegram.copyMessage(chat, media.chatId, media.messageId, extra);
    if (!sent?.message_id) throw new Error(NEWS_ADMIN_HINT);
    await rememberPostedMessage(sent.message_id);
    return { messageId: sent.message_id, kind: media.kind };
  } catch (err) {
    const reason = err instanceof Error ? err.message : NEWS_ADMIN_HINT;
    await notifyOwnerNewsError(reason);
    throw err instanceof Error ? err : new Error(reason);
  }
}

export async function contestSummary(limit = 8) {
  const rows = await listContests(limit);
  const out = [];
  for (const c of rows) {
    const entries = await contestEntryCount(c.id);
    out.push({ ...c, entries });
  }
  return out;
}
