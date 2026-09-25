import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractMedia } from "../media/extract";
import { headSize, mediaHeaders, isTikcdnHost, telegramUrlSendBlocked } from "../media/http";
import type { ExtractResult, MediaItem, MediaVariant } from "../media/types";
import { supportedDownloadPlatform, detectPlatform } from "../media/urls";
import { botDeepLink, clipActionRows, clipCaption, platformLabelAr, TRY_BOT_LABEL } from "./brand";
import {
  BOT_DISPLAY_NAME,
  BOT_USERNAME,
  TEMP_FREE,
  MAINTENANCE,
  MAINTENANCE_TEXT,
  LAUNCH_MAX,
  BARQ_AI_DAILY,
  isOwnerId,
  OWNER_IDS,
  OWNER_TG_ID,
  SUB_DAYS,
  SUB_PERIOD_SEC,
  SUB_SAR,
  SUB_STARS,
  MAX_SAR,
  MAX_STARS,
  SUPPORT_EMAIL,
  SUPPORT_URL,
  SUPPORT_USERNAME,
  TELEGRAM_MAX_UPLOAD,
  TELEGRAM_MAX_URL,
  TELEGRAM_CLOUD_MAX_MB,
  MONTHLY_CAP,
  MONTHLY_CAP_ON,
} from "./config.server";
import { askBarqAI, askOwnerGrok, diagnoseDownload, grokReady } from "./grok.server";
import {
  askBroadcast,
  enterGrokMode,
  exitGrokMode,
  GROK_KEYBOARD,
  handleOwnerAwait,
  handleOwnerPanelCallback,
  OWNER_KEYBOARD,
  runBroadcast,
  sendGrokPanel,
  sendOwnerAds,
  sendOwnerChannel,
  sendOwnerCodes,
  sendOwnerNews,
  sendOwnerPanel,
  sendOwnerSubs,
  sendOwnerSys,
  sendWatch,
} from "./owner-panel.server";
import { sendCoffeeInvoice, sendStarPicker } from "./coffee.server";
import { enqueueDownload, kickJobWorker, setJobStatusMessage } from "../jobs/queue.server";
import { rateLimitUser } from "./rate-limit.server";
import { friendlyError, logEvent, requestId } from "./observability.server";
import { maybeFunnyAd } from "./ads.server";
import { stampMedia } from "./watermark.server";
import { MediaBlockedError, userBlockMessage } from "./safety";
import { awaitMap, busySet, clearAwait, heroFileId, inGrokMode, lastClip, peekAwait, setAwait, setHeroFileId, setLastClip, setLastOwnerMedia } from "./session.server";
import { botSettings, downloadAccess, joinHref } from "./settings.server";
import { liveUsername, markError, markProcessed } from "./state";
import {
  bumpDownload,
  createClipLink,
  createGiftCode,
  getMember,
  getSettings,
  grantDays,
  isSubscribed,
  launchSeat,
  countMembers,
  logDownload,
  logFilterEvent,
  recordPayment,
  redeemCode,
  resetDownloads,
  setSetting,
  takeAiTurn,
  unbanUser,
  upsertMember,
  type Member,
} from "./store.server";
import { ERROR_MESSAGES } from "./errors";
import {
  inlineKeyboard,
  replyKeyboard,
  sendAnimationFile,
  sendAudioFile,
  sendDocumentFile,
  sendPhotoFile,
  sendVideoFile,
  telegram,
  urlsFromMessage,
  type TgBtn,
  type TgCallbackQuery,
  type TgMessage,
  type TgUpdate,
} from "./telegram.server";
import {
  appealDecisionMessage,
  appealReceivedMessage,
  bannedUserMessage,
  ownerAppealNotice,
  parseAppealNote,
} from "./bans";
import {
  bannedCallbackPermitted,
  bannedMessageAction,
  blocksBannedJob,
  hostfileYieldsToDownload,
  decideHostfile,
  parseJobCancelId,
  swallowSideEffect,
} from "./handle-guards";
import {
  AD_BTN,
  SUPPORT_BTN,
  OWNER_ONLY_LABELS,
  FREE_KEYBOARD,
  keysFor,
  roleOf,
  type UserRole,
} from "./keyboard";
import { classifyIntent } from "./router";
import { publicStartCaption } from "./copy";
import { handleUpload } from "./handlers/upload.handler";
import { handleAnalyze, handleStudio } from "./handlers/ai.handler";
import { handleLive } from "./handlers/live.handler";
import { handleAccount, handlePoints } from "./handlers/account.handler";
import { handleSubscription } from "./handlers/subscription.handler";

let membersCache = { n: 0, at: 0 };
async function cachedMemberCount(): Promise<number> {
  if (membersCache.n > 0 && Date.now() - membersCache.at < 60_000) return membersCache.n;
  const n = await countMembers().catch(() => membersCache.n);
  membersCache = { n, at: Date.now() };
  return n;
}

const AD_COOLDOWN_MS = 15 * 60 * 1000;

function signatureCaption(
  kind: "video" | "photo" | "audio" = "video",
  platform?: string,
  sourceUrl?: string,
): string {
  return clipCaption(liveUsername() || BOT_USERNAME, kind, platform, sourceUrl);
}

function tryBotButton(): TgBtn {
  return { text: TRY_BOT_LABEL, url: botDeepLink(liveUsername() || BOT_USERNAME, "try") };
}

function tryBotMarkup(extraRows: TgBtn[][] = []) {
  return inlineKeyboard([[tryBotButton()], ...extraRows]);
}

function tryBotMarkupJson(extraRows: TgBtn[][] = []) {
  return JSON.stringify(tryBotMarkup(extraRows));
}

function ownerMediaKind(msg: TgMessage): string | null {
  if (msg.photo?.length) return "photo";
  if (msg.video) return "video";
  if (msg.animation) return "animation";
  if (msg.sticker) return "sticker";
  if (msg.document) return "document";
  return null;
}

function howText(free: number, channel: string, role: UserRole = "free"): string {
  const join = channel
    ? `انضم إلى @${channel} (تحديثات وأخبار ومسابقات) لتحصل على ${free} تحميلات مجانية.`
    : `${free} تحميلات مجانية للتجربة.`;
  if (role === "sub") {
    return `كيف يعمل برق ⚡️

1. انسخ رابط المقطع
2. الصقه هنا
3. يصلك الملف بأعلى جودة

اشتراكك ساري — التحميل بلا حدود.

الدعم
@${SUPPORT_USERNAME}`;
  }
  if (TEMP_FREE) {
    return `كيف يعمل برق ⚡️

1. انسخ رابط المقطع من أي منصة
2. الصقه هنا
3. يصلك الملف بأعلى جودة

اكتب أي شيء لـ Barq AI: لخّص الفيديو، اشرح، حوّل فكرة.
تنبيه: المحتوى الإباحي و+18 قد يودي للحظر. نحن براء أمام الله من هذا المحتوى.

التحديثات: @${channel || "barq_all"}
الدعم @${SUPPORT_USERNAME}
${SUPPORT_EMAIL}`;
  }
  return `كيف يعمل برق ⚡️

1. انسخ رابط المقطع من تيك توك أو إنستغرام أو يوتيوب أو إكس أو فيسبوك أو أي منصة
2. الصقه هنا
3. يصلك الملف بأعلى جودة

تنبيه: المحتوى الإباحي و+18 قد يودي للحظر. نحن براء أمام الله من هذا المحتوى.

المجاني
${join}
بعد نفادها: اشترك، أو شاهد إعلانًا لتجديد ${free} فيديوهات.

الاشتراك
${SUB_SAR} ريال شهريًا بنجوم تليجرام — تحميل بلا حدود ورابط مختصر لكل مقطع.

الدعم
@${SUPPORT_USERNAME}

حد تليجرام: إذا كان الأصل أكبر، تصلك أزرار الجودة المباشرة.`;
}

function startCaption(free: number, channel: string, role: UserRole): string {
  if (role === "owner") {
    return `${BOT_DISPLAY_NAME}
لوحة المالك جاهزة.

الصق رابطًا، أو افتح الموقع:
https://abdulrhman.ai

لخّصه وكابشن ورابط مؤقت تحت.`;
  }
  if (role === "sub") {
    return `${BOT_DISPLAY_NAME}
اشتراكك ساري — التحميل بلا حدود ورابط مختصر لكل مقطع.

انسخ الرابط والصقه هنا.`;
  }
  const join = channel
    ? `انضم إلى @${channel} ثم اضغط «تحقق من الانضمام» لتحصل على ${free} تحميلات مجانية.`
    : `${free} تحميلات مجانية ثم اشتراك شهري.`;
  if (TEMP_FREE) {
    return publicStartCaption({ free, channel, support: SUPPORT_USERNAME });
  }
  return `${BOT_DISPLAY_NAME}
حمّل أي فيديو أو صورة بأعلى جودة خلال ثوانٍ.

كيف تستخدم البوت
1. انسخ رابط المقطع
2. الصقه هنا
3. يصلك الملف بتوقيع برق

المجاني
${join}
أو شاهد إعلانًا لتجديد ${free} فيديوهات.

الاشتراك
${SUB_SAR} ريال عبر نجوم تليجرام — بلا حدود + رابط مختصر لكل مقطع.

الدعم
@${SUPPORT_USERNAME}

أرسل الرابط الآن.`;
}

function navKeyboard(role: UserRole, channel?: string): TgBtn[][] {
  if (role === "owner") {
    return [
      [
        { text: "لوحة التحكم", callback_data: "adm:home" },
        { text: "Barq AI", callback_data: "adm:grok" },
      ],
      [
        { text: "رابط مؤقت", callback_data: "go:short" },
        { text: "المراقبة", callback_data: "adm:watch" },
      ],
      [
        { text: "الإحصائيات", callback_data: "adm:stat" },
        { text: "أكواد", callback_data: "adm:codes" },
      ],
      [
        { text: "إرسال للجميع", callback_data: "adm:bc" },
        { text: "النظام", callback_data: "adm:sys" },
      ],
      [
        { text: "القناة والمجاني", callback_data: "adm:ch" },
        { text: "أخبار القناة", callback_data: "adm:news" },
      ],
      [
        { text: "كيف يعمل", callback_data: "go:how" },
        { text: "دعم فني", url: SUPPORT_URL },
      ],
    ];
  }
  if (role === "sub") {
    return [
      [
        { text: "رابط مؤقت", callback_data: "go:short" },
        { text: "كيف يعمل", callback_data: "go:how" },
      ],
      [{ text: "دعم فني", url: SUPPORT_URL }],
    ];
  }
  const rows: TgBtn[][] = [
    [{ text: "Barq AI", callback_data: "go:ai" }],
    [{ text: "رابط مؤقت", callback_data: "go:short" }],
    [
      { text: "رحلتي", callback_data: "gx:j:list" },
      { text: "إنجازاتي", callback_data: "gx:ach" },
    ],
    [{ text: "حالة برق", callback_data: "go:ops" }],
    [{ text: "كيف يعمل", callback_data: "go:how" }],
  ];
  if (channel) {
    if (TEMP_FREE) {
      rows.push([{ text: "قناة التحديثات", url: joinHref(channel) }]);
    } else {
      rows.push([
        { text: "انضم للقناة", url: joinHref(channel) },
        { text: "تحقق من الانضمام", callback_data: "go:joinok" },
      ]);
    }
  }
  rows.push([{ text: "دعم فني", url: SUPPORT_URL }]);
  return rows;
}

async function enrichSizes(item: MediaItem): Promise<MediaItem> {
  const variants = await Promise.all(
    item.variants.map(async (v) => {
      if (v.size) return v;
      const size = await headSize(v.url).catch(() => undefined);
      return { ...v, size };
    }),
  );
  return { ...item, variants };
}

function bestUnder(item: MediaItem, maxBytes: number): MediaVariant | undefined {
  const ranked = [...item.variants].sort(
    (a, b) =>
      (b.bitrate ?? 0) - (a.bitrate ?? 0) ||
      (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
  );
  return ranked.find((v) => v.size && v.size <= maxBytes) ?? ranked.find((v) => !v.size);
}

async function downloadBlob(url: string, maxBytes = TELEGRAM_MAX_UPLOAD): Promise<Blob> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 50000);
  try {
    const res = await fetch(url, { headers: mediaHeaders(undefined, url), signal: ctrl.signal });
    if (!res.ok) throw new Error(`تعذر تنزيل الملف (${res.status})`);
    const len = Number(res.headers.get("content-length") || 0);
    if (len > maxBytes) throw new Error(ERROR_MESSAGES.FILE_TOO_LARGE);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) throw new Error(ERROR_MESSAGES.FILE_TOO_LARGE);
    return new Blob([buf], { type: res.headers.get("content-type") || "video/mp4" });
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message))) {
      throw new Error(ERROR_MESSAGES.DOWNLOAD_TIMEOUT);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function filename(result: ExtractResult, item: MediaItem, quality: string): string {
  const id = result.id ?? "media";
  const ext = item.kind === "photo" ? "jpg" : item.kind === "audio" ? "m4a" : "mp4";
  return `barq-${id}-${quality}.${ext}`;
}

function qualityButtons(item: MediaItem): TgBtn[][] {
  const rows: TgBtn[][] = [];
  let row: TgBtn[] = [];
  const seen = new Set<string>();
  for (const v of item.variants) {
    if (seen.has(v.quality)) continue;
    seen.add(v.quality);
    const size = v.size ? ` ${Math.round(v.size / (1024 * 1024))}MB` : "";
    row.push({ text: `${v.quality}${size}`, url: v.url });
    if (row.length === 2) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  return rows;
}

function estimatedBytes(v: { size?: number; bitrate?: number }, duration?: number): number | undefined {
  if (typeof v.size === "number" && v.size > 0) return v.size;
  const seconds = duration && duration > 0 ? duration : v.bitrate && v.bitrate >= 6_000_000 ? 45 : undefined;
  if (v.bitrate && seconds) return Math.round((v.bitrate / 8) * seconds);
  return undefined;
}

async function clipMarkup(chatId: number, sourceUrl?: string) {
  let accountUrl: string | undefined;
  if (chatId > 0) {
    try {
      const { issueAccountLink } = await import("./account.server");
      accountUrl = await issueAccountLink(chatId);
    } catch {
      accountUrl = undefined;
    }
  }
  return inlineKeyboard(clipActionRows(accountUrl, sourceUrl));
}

async function sendVideoItem(
  chatId: number,
  result: ExtractResult,
  item: MediaItem,
  withCaption: boolean,
  stamp: boolean,
): Promise<number | null> {
  const filled = await enrichSizes(item);
  const cloudMax = (Number(process.env.TELEGRAM_CLOUD_MAX_MB) || TELEGRAM_CLOUD_MAX_MB || 50) * 1024 * 1024;
  const dur = filled.duration;
  const known = filled.variants.filter((v) => (estimatedBytes(v, dur) ?? 0) > 0);
  const under = filled.variants.filter((v) => {
    const n = estimatedBytes(v, dur);
    return !n || n <= cloudMax;
  });
  if (under.length === 0 && known.length > 0 && known.every((v) => (estimatedBytes(v, dur) ?? 0) > cloudMax)) {
    throw new Error("OVERSIZE_HOST_LINK");
  }
  const capKind = item.kind === "audio" ? "audio" : "video";
  const cap = withCaption ? signatureCaption(capKind, result.platform, result.sourceUrl) : undefined;
  const markup = await clipMarkup(chatId, result.sourceUrl);
  const extra: Record<string, unknown> = { reply_markup: markup };
  if (item.kind !== "audio") extra.supports_streaming = true;
  if (cap) extra.caption = cap;
  if (filled.width) extra.width = filled.width;
  if (filled.height) extra.height = filled.height;
  if (filled.duration) extra.duration = Math.round(filled.duration);
  if (filled.thumbnail) extra.thumbnail = filled.thumbnail;

  await telegram.sendChatAction(chatId, item.kind === "audio" ? "upload_voice" : "upload_video");

  const ranked = [...(under.length ? under : filled.variants)].sort(
    (a, b) =>
      (b.height ?? 0) - (a.height ?? 0) ||
      (b.bitrate ?? 0) - (a.bitrate ?? 0) ||
      (b.size ?? 0) - (a.size ?? 0),
  );
  if (!ranked.length && item.url) {
    ranked.push({ url: item.url, quality: "أصل", contentType: "video/mp4" });
  }

  const tikcdn = ranked.filter((v) => isTikcdnHost(v.url) || /ssstik\.io/i.test(v.url));
  const others = ranked.filter((v) => !isTikcdnHost(v.url) && !/ssstik\.io/i.test(v.url));
  const urlSendOrder = [...tikcdn, ...others];

  for (const v of urlSendOrder) {
    const est = estimatedBytes(v, dur);
    if (est && est > TELEGRAM_MAX_URL) continue;
    if (telegramUrlSendBlocked(v.url)) continue;
    try {
      if (item.kind === "gif") {
        const sent = await telegram.sendAnimationUrl(chatId, v.url, extra);
        return sent.message_id;
      } else if (item.kind === "audio") {
        const sent = await telegram.sendAudioUrl(chatId, v.url, extra);
        return sent.message_id;
      } else {
        const sent = await telegram.sendVideoUrl(chatId, v.url, extra);
        const fid = sent.video?.file_id;
        if (fid) {
          const { saveTelegramFile } = await import("./file-cache.server");
          await saveTelegramFile(result.sourceUrl, fid, "video").catch(() => undefined);
        }
        return sent.message_id;
      }
    } catch {
      /* twitter CDN / some rehosts block Telegram fetch — upload instead */
    }
  }

  let lastErr: unknown;
  for (const v of ranked) {
    const est = estimatedBytes(v, dur);
    if (est && est > TELEGRAM_MAX_UPLOAD) continue;
    try {
      let blob = await downloadBlob(v.url);
      if (stamp && item.kind !== "audio") {
        try {
          blob = await stampMedia(blob, "video");
        } catch {
          /* send without mark */
        }
      }
      if (blob.size > TELEGRAM_MAX_UPLOAD) continue;
      const fileExtra: Record<string, string> = { reply_markup: JSON.stringify(markup) };
      if (cap) fileExtra.caption = cap;
      if (item.kind === "gif") {
        await sendAnimationFile(chatId, blob, filename(result, item, v.quality), fileExtra);
        return null;
      }
      if (item.kind === "audio") {
        const uploaded = await sendAudioFile(chatId, blob, filename(result, item, v.quality), fileExtra);
        return uploaded?.message_id ?? null;
      }
      const uploaded = await sendVideoFile(chatId, blob, filename(result, item, v.quality), fileExtra);
      if (uploaded?.file_id) {
        const { saveTelegramFile } = await import("./file-cache.server");
        await saveTelegramFile(result.sourceUrl, uploaded.file_id, "video").catch(() => undefined);
      }
      return uploaded?.message_id ?? null;
    } catch (err) {
      lastErr = err;
      /* try the next (smaller) variant — do not abort the ladder on one timeout */
    }
  }

  if (lastErr instanceof Error) throw lastErr;
  throw new Error("تعذر إرسال الفيديو إلى تليجرام");
}

async function sendPhotoItem(
  chatId: number,
  result: ExtractResult,
  item: MediaItem,
  withCaption: boolean,
  stamp: boolean,
): Promise<number | null> {
  const cap = withCaption ? signatureCaption("photo", result.platform, result.sourceUrl) : undefined;
  const markup = await clipMarkup(chatId, result.sourceUrl);
  const photoExtra: Record<string, unknown> = { reply_markup: markup };
  if (cap) photoExtra.caption = cap;
  if (!stamp) {
    try {
      const sent = await telegram.sendPhotoUrl(chatId, item.url, photoExtra);
      return sent.message_id;
    } catch {
      /* upload */
    }
  }
  let blob = await downloadBlob(item.url);
  if (stamp) {
    try {
      blob = await stampMedia(blob, "photo");
    } catch {
      /* ignore */
    }
  }
  const fileExtra: Record<string, string> = {};
  if (cap) fileExtra.caption = cap;
  await sendPhotoFile(chatId, blob, filename(result, item, "orig"), fileExtra);
  return null;
}

export async function deliver(chatId: number, result: ExtractResult, stamp = false, fromId?: number): Promise<number[]> {
  if (prefersWebsite(result)) {
    const hosted = await sendHostedMedia(chatId, fromId ?? chatId, result);
    return hosted ? [hosted] : [];
  }
  const videos = result.items.filter((i) => i.kind === "video" || i.kind === "gif");
  const preferred = videos.length
    ? videos.slice(0, 1)
    : result.items.some((i) => i.kind === "audio")
      ? result.items.filter((i) => i.kind === "audio").slice(0, 1)
      : result.items.slice(0, 1);
  if (preferred.length === 0) {
    throw new Error("المنشور ما فيه فيديو أو صورة");
  }
  let first = true;
  const ids: number[] = [];
  for (const item of preferred) {
    try {
      const mid =
        item.kind === "photo"
          ? await sendPhotoItem(chatId, result, item, first, stamp)
          : await sendVideoItem(chatId, result, item, first, stamp);
      if (mid) ids.push(mid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!/OVERSIZE_HOST_LINK|FILE_TOO_LARGE|حجم الملف|أكبر من الحد/.test(msg)) throw err;
      const hosted = await sendHostedMedia(chatId, fromId ?? chatId, result);
      if (hosted) ids.push(hosted);
    }
    first = false;
  }
  return ids;
}

function prefersWebsite(result: ExtractResult): boolean {
  const item = result.items.find((i) => i.kind === "video" || i.kind === "gif" || i.kind === "audio") || result.items[0];
  if (!item || item.kind === "photo") return false;
  if ((item.duration ?? 0) > 12 * 60) return true;
  const sizes = (item.variants ?? []).map((v) => v.size ?? 0).filter((n) => n > 0);
  return sizes.length > 0 && Math.min(...sizes) > 45 * 1024 * 1024;
}

async function sendHostedMedia(chatId: number, fromId: number, result: ExtractResult): Promise<number | null> {
  const item = result.items.find((i) => i.kind === "video" || i.kind === "gif" || i.kind === "audio") || result.items[0];
  if (!item) return null;
  const variant = [...(item.variants ?? [])].sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.size ?? 0) - (a.size ?? 0),
  )[0];
  const media = variant?.url || item.url;
  const { fileIdentity } = await import("../media/file-kind");
  const idn = fileIdentity({
    kind: item.kind,
    url: media,
    contentType: variant?.contentType,
    duration: item.duration,
  });
  let href = `https://abdulrhman.ai/?url=${encodeURIComponent(result.sourceUrl)}`;
  if (media) {
    try {
      const { createClipLink } = await import("./store.server");
      const made = await createClipLink({
        tgId: fromId,
        url: result.sourceUrl,
        mediaUrl: media,
        thumbnail: item.thumbnail,
        kind: item.kind,
        platform: result.platform,
      });
      href = `https://abdulrhman.ai/dl/${made.id}`;
    } catch {
      /* page fallback */
    }
  }
  const markup = await clipMarkup(fromId, result.sourceUrl);
  markup.inline_keyboard.unshift([{ text: "تحميل الملف", url: href }]);
  const sent = await telegram.sendMessage(
    chatId,
    `تنبيه\nالملف أكبر من تليجرام.\nالنوع: ${idn.label}\nالصيغة: ${idn.ext.toUpperCase()}\nاضغط الرابط ليبدأ تحميل الملف:\n${href}`,
    { reply_markup: markup },
  );
  return sent.message_id ?? null;
}

export async function sendQualityPicker(
  _chatId: number,
  _fromId: number,
  _result: ExtractResult,
  _stamp: boolean,
): Promise<boolean> {
  return false;
}

export async function fulfillQualityPick(chatId: number, fromId: number, pickId: string, choice: import("./library.server").QualityChoice) {
  const { loadMediaPick, consumeMediaPick, pickToResult, variantForChoice, choiceLabel } = await import("./library.server");
  const payload = await loadMediaPick(pickId, fromId);
  if (!payload) {
    await telegram.sendMessage(chatId, "انتهت صلاحية الاختيار. أعد إرسال الرابط.");
    return;
  }
  await consumeMediaPick(pickId, fromId);
  const result = pickToResult(payload);
  const item = result.items[0];
  if (!item) {
    await telegram.sendMessage(chatId, "ما بقي ملف. أعد إرسال الرابط.");
    return;
  }
  const variant = variantForChoice(item, choice);
  await telegram.sendChatAction(chatId, choice === "mp3" ? "upload_voice" : "upload_video");
  const { blobToMp3, blobToMp4, needsMp4Remux } = await import("../media/convert.server");
  if (choice === "mp3") {
    try {
      const audio = result.items.find((i) => i.kind === "audio");
      if (audio?.url) {
        await telegram.sendAudioUrl(chatId, audio.url, { caption: "صوت المقطع" });
      } else {
        let blob = await downloadBlob(variant.url);
        blob = await blobToMp3(blob);
        const cap = signatureCaption("audio", result.platform, result.sourceUrl);
        const name = blob.type.includes("mpeg") ? `barq-${result.id ?? "a"}.mp3` : `barq-${result.id ?? "a"}.m4a`;
        await sendAudioFile(chatId, blob, name, cap ? { caption: cap } : {});
      }
    } catch {
      await telegram.sendMessage(
        chatId,
        "تحويل الصوت غير متاح على السيرفر. أرسلت المقطع كامل بالصوت.",
      );
      const picked: MediaItem = { ...item, url: variant.url, variants: [variant], kind: item.kind === "gif" ? "gif" : "video" };
      await sendVideoItem(chatId, { ...result, items: [picked] }, picked, true, payload.stamp);
    }
  } else if (choice === "file" || choice === "snap") {
    let blob = await downloadBlob(variant.url);
    if (needsMp4Remux(variant.contentType, variant.url)) {
      blob = await blobToMp4(blob);
    }
    const name = choice === "snap" ? "snap.mp4" : `barq-${result.id ?? "v"}.mp4`;
    await sendDocumentFile(chatId, blob, name);
    if (choice === "snap") {
      await telegram.sendMessage(
        chatId,
        "نسخة سناب: ملف نظيف بدون توقيع.\nسناب ما يسمح نرفعه كتصوير لحظي من بوت — افتح سناب من الزر تحت، أو احفظ الملف للبكرة.",
      );
    }
  } else {
    const picked: MediaItem = { ...item, url: variant.url, variants: [variant], kind: item.kind === "gif" ? "gif" : "video" };
    try {
      if (needsMp4Remux(variant.contentType, variant.url)) {
        const blob = await blobToMp4(await downloadBlob(variant.url));
        const cap = signatureCaption("video", result.platform, result.sourceUrl);
        await sendVideoFile(chatId, blob, filename(result, picked, choiceLabel(choice, variant)), cap ? { caption: cap } : {});
      } else {
        await sendVideoItem(chatId, { ...result, items: [picked] }, picked, true, payload.stamp);
      }
    } catch {
      await sendVideoItem(chatId, { ...result, items: [picked] }, picked, true, payload.stamp);
    }
  }
  const { archiveDelivered } = await import("./vault.server");
  await archiveDelivered({
    fromChatId: chatId,
    messageIds: [],
    sourceUrl: result.sourceUrl,
    mediaUrl: variant.url,
    kind: choice === "mp3" ? "audio" : item.kind,
    who: { id: fromId },
  }).catch(() => undefined);
  await sendPlayCard(chatId, fromId, result).catch(() => undefined);
  await bumpDownload(fromId).catch(() => undefined);
  const { bumpDownloadOk } = await import("./growth.server");
  await bumpDownloadOk(fromId).catch(() => undefined);
  await logDownload({
    tgId: fromId,
    url: result.sourceUrl,
    platform: result.platform,
    ok: true,
    title: result.title ?? result.text,
  }).catch(() => undefined);
  await sendAfterDownload(chatId);
}

async function sendHistoryList(chatId: number, fromId: number, rows: import("./library.server").HistoryRow[], heading: string) {
  if (!rows.length) {
    await telegram.sendMessage(chatId, "ما عندك تحميلات محفوظة بعد. الصق رابط.");
    return;
  }
  const { platformLabelAr: label } = await import("./brand");
  const lines = rows.map((r, i) => {
    const title = (r.title || r.url).slice(0, 60);
    return `${i + 1}. ${label(r.platform)} — ${title}`;
  });
  const buttons = rows.slice(0, 8).map((r) => [{ text: String((r.title || r.url).slice(0, 32)), callback_data: `h:${r.id}` }]);
  buttons.push([{ text: "بحث في السجل", callback_data: "lib:search" }]);
  await telegram.sendMessage(chatId, `${heading}\n\n${lines.join("\n")}`, {
    reply_markup: inlineKeyboard(buttons),
  });
}

async function sendMonthlyCard(chatId: number, fromId: number, member?: Member | null) {
  const m = member ?? (await getMember(fromId));
  const quota = m ? await downloadAccess(m) : null;
  const { monthlyLine } = await import("./library.server");
  const used = quota?.monthlyUsed ?? 0;
  const cap = quota?.monthlyCap ?? MONTHLY_CAP;
  const unlimited = Boolean(quota?.monthlyUnlimited);
  await telegram.sendMessage(
    chatId,
    `${monthlyLine(used, cap, unlimited)}\n${unlimited ? "حسابك بلا حد شهري." : MONTHLY_CAP_ON ? "يرجع العداد أول الشهر بتوقيت الرياض." : "الحد الشهري معروض والتجربة مفتوحة."}`,
    { reply_markup: await keysFor(fromId, m) },
  );
}

async function promoBlob(): Promise<Blob | null> {
  try {
    const buf = await readFile(join(process.cwd(), "public/promo.mp4"));
    return new Blob([buf], { type: "video/mp4" });
  } catch {
    return null;
  }
}

async function sendJoinPrompt(chatId: number, channel: string, free: number, fromId?: number) {
  await telegram.sendMessage(
    chatId,
    `للحصول على ${free} تحميلات مجانية، انضم إلى @${channel} ثم اضغط تحقق.`,
    {
      reply_markup: inlineKeyboard([
        [
          { text: "انضم للقناة", url: joinHref(channel) },
          { text: "تحقق من الانضمام", callback_data: "go:joinok" },
        ],
      ]),
    },
  );
  if (fromId) {
    await telegram.sendMessage(chatId, "أو اشترك / شاهد إعلانًا.", {
      reply_markup: await keysFor(fromId),
    });
  }
}

async function sendStart(chatId: number, member: Member) {
  if (chatId < 0) {
    await telegram.sendMessage(chatId, "افتح البوت من الخاص: استخدم الزر أو ابحث @barq_ibot");
    return;
  }
  const fromId = Number(member.tg_id);
  if (isOwnerId(fromId) || isOwnerId(chatId)) {
    if (inGrokMode(fromId)) await exitGrokMode(chatId, fromId);
    await sendOwnerPanel(chatId);
    return;
  }
  const s = await botSettings();
  const role = roleOf(fromId, member);
  const { getGrowth } = await import("./growth.server");
  const growth = await getGrowth(fromId).catch(() => null);
  if (growth && growth.onboarding_step >= 0) {
    const sql = await (await import("@/lib/db")).getSql();
    await sql`update user_stats set onboarding_step = -1 where tg_id = ${String(fromId)}`.catch(() => undefined);
  }
  const caption = startCaption(s.freeDownloads, s.requiredChannel, role);
  const keys = await keysFor(fromId, member);
  try {
    await telegram.sendPhotoUrl(chatId, "https://abdulrhman.ai/brand-mark.jpg", {
      caption,
      reply_markup: keys,
    });
  } catch {
    await telegram.sendMessage(chatId, caption, { reply_markup: keys });
  }
}

async function sendSubInvoice(chatId: number, fromId?: number) {
  const { sendPlanCatalog } = await import("./plans.server");
  await sendPlanCatalog(chatId, fromId ?? chatId);
}

async function sendPaywall(chatId: number, fromId: number) {
  const seen = Number((await getSettings())[`ad_steps_${fromId}`] || 0) || 0;
  const left = Math.max(0, 3 - seen);
  await telegram.sendMessage(
    chatId,
    `خلصت ٥ تحميلات اليوم.\nشاهد ٣ إعلانات ويرجع لك ٥.\nالمتبقي: ${left} من ٣.\n\nأو اشترك بالنجوم ويصير التحميل بلا حد.`,
    {
      reply_markup: inlineKeyboard([
        [{ text: "افتح الإعلان", url: "https://abdulrhman.ai" }],
        [{ text: `تمّت المشاهدة ${Math.min(seen, 3)}/3`, callback_data: "go:adstep" }],
        [{ text: "اشترك بالنجوم", callback_data: "go:sub" }],
      ]),
    },
  );
}

async function sendSupport(chatId: number, fromId: number, member?: Member | null) {
  await telegram.sendMessage(
    chatId,
    `الدعم الفني\n\nتليجرام: @${SUPPORT_USERNAME}\nالبريد: ${SUPPORT_EMAIL}`,
    {
      reply_markup: inlineKeyboard([[{ text: "مراسلة الدعم", url: SUPPORT_URL }]]),
    },
  );
  await telegram.sendMessage(chatId, "أو اختر من الأزرار.", {
    reply_markup: await keysFor(fromId, member),
  });
}

function subStatusText(member: Member): string {
  if (!isSubscribed(member) || !member.subscribed_until) {
    return `لا يوجد اشتراك ساري.\nبلس ${SUB_SAR} ريال (${SUB_STARS} نجمة) أو ماكس ${MAX_SAR} ريال (${MAX_STARS} نجمة).`;
  }
  const until = new Date(member.subscribed_until);
  const days = Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86400000));
  const date = until.toISOString().slice(0, 10);
  return `اشتراكك ساري

المتبقي: ${days} يوم
ينتهي: ${date}

التحميل بلا حدود + رابط مختصر لكل مقطع.`;
}

async function sendAdOffer(chatId: number, fromId: number, member: Member) {
  if (TEMP_FREE) {
    await telegram.sendMessage(chatId, "البوت مجاني مؤقتًا. أرسل الرابط مباشرة.", {
      reply_markup: await keysFor(fromId, member),
    });
    return;
  }
  if (isOwnerId(fromId) || isSubscribed(member)) {
    await telegram.sendMessage(chatId, "اشتراكك يغنيك عن الإعلان. التحميل بلا حدود.", {
      reply_markup: await keysFor(fromId, member),
    });
    return;
  }
  const last = (await getSettings())[`ad_last_${fromId}`];
  if (last) {
    const elapsed = Date.now() - Date.parse(last);
    if (Number.isFinite(elapsed) && elapsed < AD_COOLDOWN_MS) {
      const waitMin = Math.max(1, Math.ceil((AD_COOLDOWN_MS - elapsed) / 60000));
      await telegram.sendMessage(
        chatId,
        `تقدر تشاهد إعلان بعد ${waitMin} دقيقة.\nأو اشترك الآن للتحميل بلا حدود.`,
        {
          reply_markup: inlineKeyboard([
            [{ text: "اشترك الآن", callback_data: "go:sub" }],
            [{ text: "دعم فني", url: SUPPORT_URL }],
          ]),
        },
      );
      return;
    }
  }
  const s = await botSettings();
  const copy =
    s.adsText ||
    `إعلان برق

اشترك بـ ${SUB_SAR} ريال وحمّل بلا حدود مع رابط مختصر لكل مقطع.

أو أكمل مشاهدة هذا الإعلان لتجديد ${s.freeDownloads} تحميلات مجانية.`;
  await telegram.sendMessage(chatId, copy, {
    reply_markup: inlineKeyboard([
      [{ text: `أكملت المشاهدة — جدّد ${s.freeDownloads} فيديوهات`, callback_data: "go:adok" }],
      [{ text: "اشترك الآن", callback_data: "go:sub" }],
    ]),
  });
}

async function claimAdBonus(chatId: number, fromId: number, member: Member) {
  if (isOwnerId(fromId) || isSubscribed(member)) {
    await telegram.sendMessage(chatId, "اشتراكك يغنيك عن الإعلان.", {
      reply_markup: await keysFor(fromId, member),
    });
    return;
  }
  const last = (await getSettings())[`ad_last_${fromId}`];
  if (last) {
    const elapsed = Date.now() - Date.parse(last);
    if (Number.isFinite(elapsed) && elapsed < AD_COOLDOWN_MS) {
      const waitMin = Math.max(1, Math.ceil((AD_COOLDOWN_MS - elapsed) / 60000));
      await telegram.sendMessage(chatId, `تقدر تشاهد إعلان بعد ${waitMin} دقيقة.`);
      return;
    }
  }
  const s = await botSettings();
  const seen = Number((await getSettings())[`ad_steps_${fromId}`] || 0) || 0;
  const next = seen + 1;
  if (next < 3) {
    await setSetting(`ad_steps_${fromId}`, String(next));
    await telegram.sendMessage(
      chatId,
      `انحسبت مشاهدة ${next} من ٣.\nباقي ${3 - next}، ثم ترجع ٥ تحميلات.`,
      {
        reply_markup: inlineKeyboard([
          [{ text: "افتح الإعلان", url: "https://abdulrhman.ai" }],
          [{ text: `تمّت المشاهدة ${next}/3`, callback_data: "go:adstep" }],
          [{ text: "اشترك بالنجوم", callback_data: "go:sub" }],
        ]),
      },
    );
    return;
  }
  await setSetting(`ad_steps_${fromId}`, "0");
  const { grantBonusDownloads } = await import("./product.server");
  await grantBonusDownloads(fromId, s.freeDownloads || 5);
  await setSetting(`ad_last_${fromId}`, new Date().toISOString());
  await telegram.sendMessage(chatId, "رجعت لك ٥ تحميلات. أرسل الرابط.", {
    reply_markup: await keysFor(fromId, member),
  });
}

async function handleAdminCommand(chatId: number, text: string, fromId: number) {
  if (chatId < 0) return;
  const { actorRole, requireActor } = await import("./acl.server");
  const { isStaff } = await import("./roles.server");
  if (!isStaff(await actorRole(fromId))) return;
  const [cmd, ...rest] = text.split(/\s+/);
  const deny = async () => {
    await telegram.sendMessage(chatId, "لا صلاحية لهذا الأمر.");
  };
  const need = async (perm: import("./roles.server").Permission) => {
    try {
      await requireActor(fromId, perm);
      return true;
    } catch {
      await deny();
      return false;
    }
  };
  if (cmd === "/admin" || cmd === "/panel") {
    await sendOwnerPanel(chatId);
    return;
  }
  if (cmd === "/grok") {
    if (!(await need("settings.write"))) return;
    await enterGrokMode(chatId, fromId);
    return;
  }
  if (cmd === "/broadcast") {
    if (!(await need("settings.write"))) return;
    const msg = rest.join(" ").trim();
    if (!msg) {
      awaitMap().set(fromId, "broadcast");
      await telegram.sendMessage(chatId, "أرسل نص الإرسال الجماعي الآن.");
      return;
    }
    await runBroadcast(chatId, msg);
    return;
  }
  if (cmd === "/newcode") {
    if (!(await need("payments.manage"))) return;
    const [code, daysRaw, usesRaw] = rest;
    const days = Number(daysRaw ?? 30);
    const uses = Number(usesRaw ?? 20);
    if (!code) {
      await telegram.sendMessage(chatId, "الاستخدام: /newcode CODE DAYS USES");
      return;
    }
    const { createCode } = await import("./store.server");
    const saved = await createCode(code, days, uses);
    await telegram.sendMessage(chatId, `تم إنشاء الكود ${saved} — ${days} يوم × ${uses}`);
    return;
  }
  if (cmd === "/grant") {
    if (!(await need("payments.manage"))) return;
    const [tgId, daysRaw] = rest;
    const days = Number(daysRaw ?? 30);
    if (!tgId) {
      await telegram.sendMessage(chatId, "الاستخدام: /grant USER_ID DAYS");
      return;
    }
    await grantDays(tgId, days);
    await telegram.sendMessage(chatId, `تم منح ${days} يوم للمستخدم ${tgId}`);
    const { logAudit } = await import("./observability.server");
    await logAudit({ actorId: fromId, action: "grant", target: tgId, detail: String(days) });
    return;
  }
  if (cmd === "/ban") {
    if (!(await need("users.manage"))) return;
    const tgId = rest[0];
    if (!tgId) {
      await telegram.sendMessage(chatId, "الاستخدام: /ban USER_ID [سبب]");
      return;
    }
    if (isOwnerId(tgId)) {
      await telegram.sendMessage(chatId, "لا يمكن حظر المالك");
      return;
    }
    const { banUser } = await import("./store.server");
    await banUser(tgId, rest.slice(1).join(" ") || "ban", String(fromId));
    const { logAudit } = await import("./observability.server");
    await logAudit({ actorId: fromId, action: "ban", target: tgId });
    await telegram.sendMessage(chatId, `حُظر ${tgId}`);
    return;
  }
  if (cmd === "/unban") {
    if (!(await need("users.unban"))) return;
    const tgId = rest[0];
    if (!tgId) {
      await telegram.sendMessage(chatId, "الاستخدام: /unban USER_ID");
      return;
    }
    await unbanUser(tgId);
    const { logAudit } = await import("./observability.server");
    await logAudit({ actorId: fromId, action: "unban", target: tgId });
    await telegram.sendMessage(chatId, `فك الحظر عن ${tgId}`);
    return;
  }
  if (cmd === "/appealok" || cmd === "/appealno") {
    if (!(await need("users.unban"))) return;
    const tgId = rest[0];
    if (!tgId) {
      await telegram.sendMessage(chatId, `الاستخدام: ${cmd} USER_ID`);
      return;
    }
    const { decideAppeal } = await import("./store.server");
    const accept = cmd === "/appealok";
    const ok = await decideAppeal(tgId, accept, String(fromId));
    const { logAudit } = await import("./observability.server");
    await logAudit({ actorId: fromId, action: accept ? "appeal_accept" : "appeal_reject", target: tgId });
    await telegram.sendMessage(chatId, appealDecisionMessage(accept, tgId, ok));
    if (ok) {
      await telegram
        .sendMessage(
          Number(tgId),
          accept ? "قُبل استئنافك وفُك الحظر." : `رُفض طلب الاستئناف. الدعم @${SUPPORT_USERNAME}`,
        )
        .catch(() => undefined);
    }
    return;
  }
  if (cmd === "/appeals") {
    if (!(await need("users.unban"))) return;
    const { listOpenAppeals } = await import("./store.server");
    const rows = await listOpenAppeals();
    if (!rows.length) {
      await telegram.sendMessage(chatId, "لا استئنافات مفتوحة.");
      return;
    }
    const lines = rows.map(
      (r) =>
        `${r.user_id} · ${(r.appeal_text ?? r.reason ?? "—").slice(0, 80)}\n/appealok ${r.user_id} · /appealno ${r.user_id}`,
    );
    await telegram.sendMessage(chatId, `استئنافات مفتوحة:\n${lines.join("\n\n")}`);
    return;
  }
  if (cmd === "/jobs") {
    if (!(await need("jobs.manage"))) return;
    const { listJobs, jobStats } = await import("../jobs/queue.server");
    const counts = await jobStats();
    const jobs = await listJobs(8);
    const lines = jobs.map((j) => `${j.status} · ${j.id.slice(0, 8)} · ${j.error_code ?? "—"}`).join("\n");
    await telegram.sendMessage(
      chatId,
      `المهام ⚡️\nانتظار ${counts.pending} · شغل ${counts.processing} · فشل ${counts.failed}\n${lines || "لا مهام"}`,
    );
    return;
  }
  if (cmd === "/retry") {
    if (!(await need("jobs.retry"))) return;
    const id = rest[0];
    if (!id) {
      await telegram.sendMessage(chatId, "الاستخدام: /retry JOB_ID");
      return;
    }
    const { retryJobById } = await import("../jobs/queue.server");
    const job = await retryJobById(id);
    await telegram.sendMessage(chatId, `أُعيدت ${job.id} → ${job.status}`);
    return;
  }
  if (cmd === "/tickets") {
    if (!(await need("tickets.read"))) return;
    const { listTickets } = await import("./tickets.server");
    const rows = await listTickets(12);
    const body = rows
      .map((r) => `${r.id} · ${r.status} · ${r.user_id} · ${(r.message ?? "").slice(0, 60)}`)
      .join("\n");
    await telegram.sendMessage(chatId, `تذاكر الدعم\n${body || "لا تذاكر"}`);
    return;
  }
  if (cmd === "/reports") {
    if (!(await need("reports.review"))) return;
    const { listFilterEvents } = await import("./store.server");
    const rows = await listFilterEvents(10);
    const body = rows.map((r) => `${r.tg_id ?? ""} · ${r.reason ?? r.kind}`).join("\n");
    await telegram.sendMessage(chatId, `البلاغات\n${body || "لا بلاغات"}`);
    return;
  }
  if (cmd === "/block") {
    if (!(await need("content.ban"))) return;
    const target = rest.join(" ").trim();
    if (!target) {
      await telegram.sendMessage(chatId, "الاستخدام: /block رابط أو كلمة");
      return;
    }
    const { logFilterEvent } = await import("./store.server");
    await logFilterEvent({ tgId: fromId, url: target.slice(0, 400), kind: "mod-block", reason: "mod-block" });
    const { logAudit } = await import("./observability.server");
    await logAudit({ actorId: fromId, action: "content_ban", target: target.slice(0, 180) });
    await telegram.sendMessage(chatId, "سُجّل حظر المحتوى.");
  }
}

async function handleJoinCheck(chatId: number, fromId: number, member: Member) {
  const access = await downloadAccess(await upsertMember({ tgId: fromId }));
  if (!access.channel) {
    await telegram.sendMessage(chatId, "لا توجد قناة مشروطة حاليًا. أرسل الرابط للتحميل.", {
      reply_markup: await keysFor(fromId, member),
    });
    return;
  }
  if (access.needJoin) {
    await sendJoinPrompt(chatId, access.channel, access.freeDownloads, fromId);
    return;
  }
  await telegram.sendMessage(
    chatId,
    `تم التحقق. لديك ${access.remaining < 0 ? "تحميل بلا حدود" : `${access.remaining} تحميلات مجانية`}. أرسل الرابط.`,
    { reply_markup: await keysFor(fromId, member) },
  );
}

async function sendMaintenance(chatId: number) {
  await telegram.sendMessage(chatId, MAINTENANCE_TEXT, {
    reply_markup: inlineKeyboard([
      [{ text: "رحلة قصيرة ريثما نعود", callback_data: "gx:j:list" }],
      [{ text: "إنجازاتي", callback_data: "gx:ach" }],
    ]),
  });
}

async function handleCallback(cb: TgCallbackQuery) {
  const fromId = cb.from.id;
  const targetChat = fromId;
  const data = cb.data ?? "";
  if (MAINTENANCE && !isOwnerId(fromId) && !data.startsWith("gx:")) {
    await telegram.answerCallback(cb.id);
    await sendMaintenance(targetChat);
    return;
  }
  const member = await upsertMember({
    tgId: fromId,
    username: cb.from.username,
    firstName: cb.from.first_name,
  });
  if (blocksBannedJob(member.is_banned, isOwnerId(fromId)) && !bannedCallbackPermitted(data)) {
    await telegram.answerCallback(cb.id, "حسابك موقوف", true);
    await telegram.sendMessage(targetChat, bannedUserMessage(SUPPORT_USERNAME)).catch(() => undefined);
    return;
  }
  if (data.startsWith("adm:")) {
    const { actorRole } = await import("./acl.server");
    const { isStaff } = await import("./roles.server");
    const role = await actorRole(fromId);
    if (!isStaff(role)) {
      await telegram.answerCallback(cb.id, "لا صلاحية", true);
      return;
    }
    await handleOwnerPanelCallback(cb);
    return;
  }
  if (data.startsWith("ct:e:")) {
    const contestId = data.slice(5);
    const fromId = cb.from.id;
    try {
      const channel = await import("./channel.server");
      const result = await channel.joinContest(contestId, fromId, cb.from.username, cb.from.first_name);
      if (result.already) {
        await telegram.answerCallback(cb.id, "أنت مسجّل مسبقًا", true);
      } else if (!result.ok) {
        await telegram.answerCallback(cb.id, result.error || "تعذر التسجيل", true);
      } else {
        await telegram.answerCallback(cb.id, `تم تسجيلك · ${result.count} مشارك`);
        await telegram
          .sendMessage(
            fromId,
            `سجّلناك في المسابقة.\nالمشاركون حتى الآن: ${result.count}\nإذا فزت يصلك تنبيه هنا.`,
            { reply_markup: await keysFor(fromId, member) },
          )
          .catch(() => undefined);
      }
    } catch (err) {
      await telegram.answerCallback(cb.id, err instanceof Error ? err.message : "خطأ", true);
    }
    return;
  }
  if (data.startsWith("tip:")) {
    const stars = Number(data.slice(4));
    await telegram.answerCallback(cb.id);
    await sendCoffeeInvoice(targetChat, stars);
    return;
  }
  if (data.startsWith("gx:")) {
    const { handleGrowthCallback } = await import("./growth.server");
    await handleGrowthCallback(targetChat, fromId, data, {
      callbackId: cb.id,
      messageId: cb.message?.message_id,
    });
    return;
  }
  {
    const { parseQualityCallback } = await import("./library.server");
    const q = parseQualityCallback(data);
    if (q) {
      await telegram.answerCallback(cb.id, "جاري التجهيز");
      try {
        await fulfillQualityPick(targetChat, fromId, q.id, q.choice);
      } catch (err) {
        await telegram.sendMessage(targetChat, friendlyError(err)).catch(() => undefined);
      }
      return;
    }
  }
  if (data.startsWith("h:")) {
    const id = Number(data.slice(2));
    await telegram.answerCallback(cb.id);
    const { historyUrl } = await import("./library.server");
    const url = Number.isFinite(id) ? await historyUrl(id, fromId) : null;
    if (!url) {
      await telegram.sendMessage(targetChat, "ما لقيت هذا التحميل.");
      return;
    }
    await handleDownload(targetChat, fromId, url, member);
    return;
  }
  if (data === "lib:search") {
    awaitMap().set(fromId, "lib_search");
    await telegram.answerCallback(cb.id);
    await telegram.sendMessage(targetChat, "أرسل كلمة البحث: عنوان أو رابط أو منصة.");
    return;
  }
  if (data === "lib:queue") {
    await telegram.answerCallback(cb.id);
    const { listUserJobs } = await import("../jobs/queue.server");
    const jobs = await listUserJobs(fromId, 8);
    if (!jobs.length) {
      await telegram.sendMessage(targetChat, "طابورك فارغ.");
      return;
    }
    const lines = jobs.map((j, i) => `${i + 1}. ${j.status} — ${(j.url || "").slice(0, 48)}`);
    await telegram.sendMessage(targetChat, `طابورك\n${lines.join("\n")}`);
    return;
  }
  if (data === "ai:pack" || data === "ai:analyze" || data === "ai:studio") {
    await telegram.answerCallback(cb.id, "الذكاء يشتغل…");
    await telegram.sendChatAction(targetChat, "typing");
    if (data === "ai:pack") {
      const { packClip } = await import("./analyze.server");
      const text = await packClip(fromId);
      await telegram.sendMessage(targetChat, text.slice(0, 4000));
      return;
    }
    if (data === "ai:analyze") await handleAnalyze(targetChat, fromId, member);
    else await handleStudio(targetChat, fromId, member);
    return;
  }
  if (data === "pt:redeem") {
    await telegram.answerCallback(cb.id);
    const { redeemPoints } = await import("./points.server");
    const out = await redeemPoints(fromId);
    await telegram.sendMessage(targetChat, out.message);
    return;
  }
  if (data === "rt:ask") {
    await telegram.answerCallback(cb.id);
    await telegram.sendMessage(targetChat, "كم تقيّم التحميل؟", {
      reply_markup: inlineKeyboard([
        [
          { text: "1", callback_data: "rt:1" },
          { text: "2", callback_data: "rt:2" },
          { text: "3", callback_data: "rt:3" },
          { text: "4", callback_data: "rt:4" },
          { text: "5", callback_data: "rt:5" },
        ],
      ]),
    });
    return;
  }
  if (data.startsWith("rt:")) {
    const stars = Number(data.slice(3));
    await telegram.answerCallback(cb.id, "شكرًا");
    const clip = lastClip(fromId);
    const { saveRating } = await import("./product.server");
    await saveRating(fromId, clip?.url || "unknown", stars).catch(() => undefined);
    const { awardPoints } = await import("./points.server");
    await awardPoints(fromId, "rating").catch(() => undefined);
    await telegram.sendMessage(targetChat, `قييمك ${stars}★ وصل.`).catch(() => undefined);
    return;
  }
  if (data.startsWith("job:cancel:")) {
    const id = parseJobCancelId(data);
    try {
      if (!id) {
        await telegram.answerCallback(cb.id, "تعذر الإلغاء");
        return;
      }
      const { cancelJob } = await import("../jobs/queue.server");
      // cancelJob transitions the job then killJobProcess (SIGTERM→SIGKILL) — not DB-only
      const ok = await cancelJob(id, fromId);
      await telegram.answerCallback(cb.id, ok ? "تم الإلغاء" : "تعذر الإلغاء");
      if (ok && cb.message?.message_id) {
        await telegram
          .editMessageText(targetChat, cb.message.message_id, "تم إلغاء التحميل.")
          .catch(() => undefined);
      }
    } catch {
      await telegram.answerCallback(cb.id, "تعذر الإلغاء").catch(() => undefined);
    }
    return;
  }
  if (data.startsWith("job:retry:")) {
    const id = data.slice("job:retry:".length);
    try {
      const { getJob, retryJobById, kickJobWorker } = await import("../jobs/queue.server");
      const job = await getJob(id);
      if (!job || (String(job.tg_id) !== String(fromId) && !isOwnerId(fromId))) {
        await telegram.answerCallback(cb.id, "هذه المهمة ليست لك", true);
        return;
      }
      await retryJobById(id);
      await kickJobWorker(id);
      await telegram.answerCallback(cb.id, "أُعيدت المحاولة");
      if (cb.message?.message_id) {
        await telegram
          .editMessageText(targetChat, cb.message.message_id, "أعيد التحميل…")
          .catch(() => undefined);
      }
    } catch (err) {
      await telegram.answerCallback(cb.id, err instanceof Error ? err.message : "تعذر الإعادة", true);
    }
    return;
  }
  if (data === "go:ai") {
    await telegram.answerCallback(cb.id);
    await telegram.sendMessage(
      targetChat,
      "أنا برق AI. اكتب أي شيء: لخّص الفيديو، اشرح، حوّل فكرة، أو الصق رابطًا للتحميل.",
      { reply_markup: await keysFor(fromId, member) },
    );
    return;
  }
  if (data === "go:short") {
    await telegram.answerCallback(cb.id);
    await sendShortLink(targetChat, fromId);
    return;
  }
  if (data === "go:host") {
    await telegram.answerCallback(cb.id);
    setAwait(fromId, "hostfile");
    await telegram.sendMessage(
      targetChat,
      "أرسل الملف الآن (صورة أو فيديو أو مضغوط أو تطبيق).\nرابط مباشر 24 ساعة · حد 20 ميغا.",
    );
    return;
  }
  if (data.startsWith("cd:")) {
    const code = data.slice(3);
    const result = await redeemCode(fromId, code);
    await telegram.answerCallback(cb.id, result.ok ? "تم التفعيل" : result.message, !result.ok);
    await telegram.sendMessage(targetChat, result.message, {
      reply_markup: await keysFor(fromId, member),
    });
    return;
  }
  await telegram.answerCallback(cb.id);
  if (data === "go:start" || data === "go:menu") {
    await sendStart(targetChat, member);
    return;
  }
  if (data === "go:how") {
    const s = await botSettings();
    await telegram.sendMessage(targetChat, howText(s.freeDownloads, s.requiredChannel, roleOf(fromId, member)), {
      reply_markup: await keysFor(fromId, member),
    });
    return;
  }
  if (data === "go:ops") {
    const { sendSystemStatus } = await import("./ops.server");
    await sendSystemStatus(targetChat);
    return;
  }
  if (data === "go:sub") {
    await sendSubInvoice(targetChat, fromId);
    return;
  }
  if (data === "go:sub:plus" || data === "go:sub:max" || data === "go:sub:pro" || data === "go:sub:season") {
    const { sendPlanInvoice } = await import("./plans.server");
    const id = data.endsWith("max") ? "max" : data.endsWith("pro") ? "pro" : data.endsWith("season") ? "season" : "plus";
    await sendPlanInvoice(targetChat, fromId, id);
    return;
  }
  if (data === "go:stars") {
    await telegram.answerCallback(cb.id);
    await sendStarPicker(targetChat);
    return;
  }
  if (data === "go:coffee") {
    await telegram.answerCallback(cb.id);
    await sendCoffeeInvoice(targetChat);
    return;
  }
  if (data === "go:code") {
    awaitMap().set(fromId, "code");
    await telegram.sendMessage(targetChat, "أرسل كود التفعيل الآن.", {
      reply_markup: await keysFor(fromId, member),
    });
    return;
  }
  if (data === "go:joinok") {
    await handleJoinCheck(targetChat, fromId, member);
    return;
  }
  if (data === "go:ad") {
    await sendAdOffer(targetChat, fromId, member);
    return;
  }
  if (data === "go:adok" || data === "go:adstep") {
    await claimAdBonus(targetChat, fromId, member);
    return;
  }
  if (data === "go:status") {
    await telegram.sendMessage(targetChat, subStatusText(member), {
      reply_markup: await keysFor(fromId, member),
    });
    return;
  }
  if (data === "go:support") {
    await sendSupport(targetChat, fromId, member);
  }
}

export async function handleBlocked(
  chatId: number,
  fromId: number,
  url: string,
  err: MediaBlockedError,
  _username?: string,
) {
  await logDownload({
    tgId: fromId,
    url,
    ok: false,
    blocked: true,
    reason: err.evidence,
    verdict: err.kind,
  }).catch(() => undefined);
  await logFilterEvent({
    tgId: fromId,
    url,
    kind: err.kind,
    reason: "blocked",
    evidence: err.evidence,
  }).catch(() => undefined);
  const text = err.message?.trim() || userBlockMessage(err.kind);
  if (text) await telegram.sendMessage(chatId, text).catch(() => undefined);
}

async function clipOrigin(): Promise<string> {
  const { requirePublicOrigin } = await import("./origin");
  return requirePublicOrigin();
}

function pickPlayUrl(result: ExtractResult): string | undefined {
  const item = result.items[0];
  if (!item) return undefined;
  const ranked = [...item.variants].sort(
    (a, b) => (a.size ?? 9e15) - (b.size ?? 9e15) || (a.height ?? 0) - (b.height ?? 0),
  );
  return ranked[0]?.url || item.url;
}

export async function sendAfterDownload(_chatId: number) {
  return;
}

export async function sendPlayCard(chatId: number, fromId: number, result: ExtractResult) {
  const item = result.items[0];
  const mediaUrl = pickPlayUrl(result);
  if (!item || !mediaUrl) return;
  setLastClip(fromId, {
    url: result.sourceUrl,
    title: result.title ?? result.text,
    platform: result.platform,
    mediaUrl,
    thumbnail: item.thumbnail,
    kind: item.kind,
  });
  const { rememberClip } = await import("./library.server");
  await rememberClip(fromId, {
    url: result.sourceUrl,
    title: result.title ?? result.text,
    platform: result.platform,
    mediaUrl,
    thumbnail: item.thumbnail,
    kind: item.kind,
  }).catch(() => undefined);
}

async function sendSourceLine(chatId: number, result: ExtractResult) {
  await telegram.sendMessage(chatId, `متصل من: ${platformLabelAr(result.platform)}`, {
    reply_markup: inlineKeyboard([
      [{ text: "رابط مؤقت", callback_data: "go:short" }],
    ]),
  });
}

async function hostIncomingIfAny(chatId: number, fromId: number, msg: TgMessage): Promise<boolean> {
  return handleUpload(chatId, fromId, msg);
}

async function sendShortLink(chatId: number, fromId: number) {
  const clip = lastClip(fromId);
  if (!clip?.mediaUrl) {
    await telegram.sendMessage(
      chatId,
      "حمّل المقطع أولاً (الصق الرابط). بعد ما يوصلك الملف اضغط «رابط مؤقت».",
      { reply_markup: await keysFor(fromId) },
    );
    return;
  }
  const origin = await clipOrigin();
  try {
    const made = await createClipLink({
      tgId: fromId,
      url: clip.url,
      mediaUrl: clip.mediaUrl,
      thumbnail: clip.thumbnail,
      kind: clip.kind,
      platform: clip.platform,
    });
    const short = `${origin}/d/${made.id}`;
    const src = clip.platform ? `المصدر: ${platformLabelAr(clip.platform)}\n` : "";
    await telegram.sendMessage(
      chatId,
      `${src}رابط مؤقت 24 ساعة — يفتح التحميل مباشرة\n${short}`,
      {
        reply_markup: inlineKeyboard([[{ text: "تحميل المقطع", url: short }]]),
      },
    );
  } catch {
    await telegram.sendMessage(chatId, "تعذر إنشاء الرابط المختصر. أعد المحاولة.");
  }
}

async function maybeAd(chatId: number, fromId: number) {
  if (TEMP_FREE || isOwnerId(fromId)) return;
  const s = await botSettings();
  if (!s.adsEnabled || !s.adsText) return;
  await telegram.sendMessage(chatId, s.adsText).catch(() => undefined);
}

export async function assertSafeMedia(url: string, result?: ExtractResult) {
  const { assertSafeOutboundUrl } = await import("../media/ssrf");
  await assertSafeOutboundUrl(url);
  if (result) {
    for (const item of result.items) {
      if (item.url) await assertSafeOutboundUrl(item.url).catch(() => undefined);
    }
  }
  try {
    const { assertAdultVisual } = await import("./visual-guard.server");
    await assertAdultVisual(url, result);
  } catch (err) {
    if (err instanceof MediaBlockedError) throw err;
  }
  try {
    const { extraBlockKeywords } = await import("./product.server");
    const words = await extraBlockKeywords();
    if (words.length) {
      const blob = [url, result?.title, result?.text, result?.author].filter(Boolean).join("\n").toLowerCase();
      const hit = words.find((w) => blob.includes(w.toLowerCase()));
      if (hit) throw new MediaBlockedError("هذا الرابط محظور حسب قائمة المالك.", hit, "other");
    }
  } catch (err) {
    if (err instanceof MediaBlockedError) throw err;
  }
}

async function handleDownload(
  chatId: number,
  fromId: number,
  url: string,
  member: Member,
  updateId?: number,
) {
  const quota = await downloadAccess(member);
  if (blocksBannedJob(Boolean(member.is_banned) || quota.banned, isOwnerId(fromId))) {
    await telegram.sendMessage(chatId, bannedUserMessage(SUPPORT_USERNAME));
    return;
  }
  if (quota.paused && !isOwnerId(fromId)) {
    await telegram.sendMessage(chatId, "البوت متوقف مؤقتًا. حاول لاحقًا.");
    return;
  }
  try {
    supportedDownloadPlatform(url);
  } catch (err) {
    await telegram.sendMessage(chatId, err instanceof Error ? err.message : "المنصة غير مدعومة.");
    return;
  }
  {
    const { looksLikeLiveStream } = await import("./product.server");
    if (looksLikeLiveStream(url)) {
      await telegram.sendMessage(chatId, "هذا بث مباشر. أرسل المقطع بعد انتهائه، أو كليب جاهز.");
      return;
    }
  }
  {
    const { canUseYoutube, youtubeLockedText, sendPlanCatalog, subscriptionsLive } = await import("./plans.server");
    if (subscriptionsLive() && detectPlatform(url) === "youtube" && !canUseYoutube(member, fromId)) {
      await telegram.sendMessage(chatId, youtubeLockedText());
      await sendPlanCatalog(chatId, fromId);
      return;
    }
  }
  if (quota.needJoin && quota.channel) {
    await sendJoinPrompt(chatId, quota.channel, quota.freeDownloads, fromId);
    return;
  }
  if (!quota.ok) {
    if (!quota.monthlyUnlimited && MONTHLY_CAP_ON && quota.monthlyUsed >= quota.monthlyCap) {
      const { monthlyLine } = await import("./library.server");
      await telegram.sendMessage(
        chatId,
        `${monthlyLine(quota.monthlyUsed, quota.monthlyCap, false)}\nوصل الحد الشهري. يرجع أول الشهر بتوقيت الرياض.`,
      );
      return;
    }
    await sendPaywall(chatId, fromId);
    return;
  }
  {
    const { guardDownload } = await import("./abuse.server");
    await guardDownload(fromId, url);
  }
  const busy = busySet();
  const rid = requestId();
  try {
      const { queuePriorityFor } = await import("./queue-priority");
      const queued = await enqueueDownload({
        tgId: fromId,
        chatId,
        url,
        updateId,
        priority: queuePriorityFor({
          owner: isOwnerId(fromId),
          tier: member.tier,
          subscribed: quota.subscribed,
        }),
      });
    if (!queued) {
      await telegram.sendMessage(chatId, "تعذر تسجيل الطلب. أعد إرسال الرابط.");
      return;
    }
    if (queued.denied) {
      await telegram.sendMessage(
        chatId,
        queued.denied === "queue"
          ? "الطابور ممتلئ الآن. أعد المحاولة بعد قليل."
          : `وصلت حد ${quota.freeDownloads || 5} مقاطع اليوم. يرجع العدد بعد منتصف الليل بتوقيت الرياض، أو انتظر ${queued.retryAfter} ثانية.`,
      );
      return;
    }
    const { job, reused } = queued;
    if (reused) {
      const statusText =
        job.status === "uploading"
          ? "جاري رفع نفس الملف…"
          : job.status === "processing"
            ? "لحظة، لازال أحمل نفس الرابط."
            : "هذا الرابط قيد التجهيز حاليًا.";
      await telegram.sendMessage(chatId, statusText);
      if (job.status === "pending") await kickJobWorker(job.id);
      return;
    }
    busy.add(chatId);
    const status = await telegram.sendMessage(chatId, "⚡ استلمت الرابط ✅", {
      reply_markup: inlineKeyboard([
        [
          { text: "إلغاء التحميل", callback_data: `job:cancel:${job.id}` },
          { text: "طابوري", callback_data: "lib:queue" },
        ],
      ]),
    });
    await setJobStatusMessage(job.id, status.message_id).catch(() => undefined);
    const { userQueuePosition, queueEta } = await import("../jobs/queue.server").then(async (q) => ({
      userQueuePosition: q.userQueuePosition,
      queueEta: (await import("./product.server")).queueEta,
    }));
    const pos = await userQueuePosition(fromId).catch(() => 1);
    await telegram
      .editMessageText(chatId, status.message_id, `📥 في الطابور · دورك ${pos}\n${queueEta(pos)}`)
      .catch(() => undefined);
    await logEvent({ requestId: rid, tgId: fromId, action: "enqueue", status: "pending", detail: job.id });
    await kickJobWorker(job.id);
  } catch (err) {
    if (err instanceof MediaBlockedError) {
      await handleBlocked(chatId, fromId, url, err);
      return;
    }
    const message = friendlyError(err);
    markError(err instanceof Error ? err.message : message);
    await logDownload({ tgId: fromId, url, ok: false, reason: message }).catch(() => undefined);
    await telegram.sendMessage(chatId, `تعذر التحميل: ${message}`).catch(() => undefined);
  } finally {
    busy.delete(chatId);
  }
}

async function handleBarqChat(chatId: number, fromId: number, text: string) {
  if (!isOwnerId(fromId)) {
    const { canUseAi, aiLockedText, sendPlanCatalog, subscriptionsLive } = await import("./plans.server");
    const member = await getMember(fromId);
    if (subscriptionsLive() && !canUseAi(member, fromId)) {
      await telegram.sendMessage(chatId, aiLockedText(), { reply_markup: await keysFor(fromId) });
      await sendPlanCatalog(chatId, fromId);
      return;
    }
    const q = await takeAiTurn(fromId);
    if (!q.ok) {
      await telegram.sendMessage(
        chatId,
        `خلصت رسائل برق AI اليوم (${BARQ_AI_DAILY}). التحميل يبقى متاحًا — الصق الرابط.\nيرجع العدد بعد منتصف الليل بتوقيت الرياض.`,
        { reply_markup: await keysFor(fromId) },
      );
      return;
    }
  }
  await telegram.sendChatAction(chatId, "typing");
  try {
    const { isAiFailureReply } = await import("./grok.server");
    const reply = await askBarqAI(fromId, text || "مرحبا", lastClip(fromId));
    const chunks = reply.match(/[\s\S]{1,3500}/g) ?? [reply];
    for (const chunk of chunks) {
      await telegram.sendMessage(chatId, chunk, { reply_markup: await keysFor(fromId) });
    }
    if (!isAiFailureReply(reply)) {
      const { bumpAi } = await import("./growth.server");
      await bumpAi(fromId, chatId).catch(() => undefined);
    }
  } catch {
    await telegram.sendMessage(
      chatId,
      `برق AI مشغول لحظة. الصق الرابط للتحميل مباشرة.`,
      { reply_markup: await keysFor(fromId) },
    );
  }
}

async function handleOwnerChat(chatId: number, text: string, fromId: number) {
  if (!isOwnerId(fromId) || chatId < 0) return;
  await telegram.sendChatAction(chatId, "typing");
  const keys = inGrokMode(fromId) ? GROK_KEYBOARD : OWNER_KEYBOARD;
  try {
    const reply = await askOwnerGrok(text, fromId);
    const chunks = reply.match(/[\s\S]{1,3500}/g) ?? [reply];
    for (const chunk of chunks) {
      await telegram.sendMessage(chatId, chunk, { reply_markup: keys });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذر الرد";
    await telegram.sendMessage(
      chatId,
      `تعذر رد برق AI: ${message}\nلوحة التحكم ما زالت تعمل.`,
      { reply_markup: keys },
    );
  }
}

async function handleMessage(msg: TgMessage, updateId?: number) {
  const chatId = msg.chat.id;
  const from = msg.from;
  const fromId = from?.id ?? chatId;
  const text = (msg.text ?? msg.caption ?? "").trim();
  const owner = isOwnerId(fromId);
  void telegram.sendChatAction(chatId, "typing").catch(() => undefined);

  if (!owner) {
    const paced = await rateLimitUser(fromId, "msg");
    if (!paced.ok) {
      await telegram.sendMessage(chatId, `الرسائل سريعة. انتظر ${paced.retryAfter} ثوانٍ ثم أعد المحاولة.`);
      return;
    }
  }

  if (msg.successful_payment) {
    const pay = msg.successful_payment;
    const payload = pay.invoice_payload || "";
    if (payload.startsWith("sub:")) {
      const { planFromPayment } = await import("./plans.server");
      const plan = planFromPayment(payload, pay.total_amount);
      if (!plan) {
        await telegram.sendMessage(chatId, "مبلغ النجوم لا يطابق الخطة. ما تم تفعيل اشتراك.", {
          reply_markup: await keysFor(fromId),
        });
        return;
      }
      const paid = await recordPayment(fromId, pay.total_amount, pay.telegram_payment_charge_id, true, plan.id);
      if (paid.duplicate) {
        await telegram.sendMessage(chatId, "هذه الدفعة مسجّلة مسبقًا.", {
          reply_markup: await keysFor(fromId),
        });
        return;
      }
      await telegram.sendMessage(
        chatId,
        `تم تفعيل ${plan.title} ⚡️\n${plan.blurb}\nالمدة: ${plan.days} يوم.`,
        { reply_markup: await keysFor(fromId) },
      );
      return;
    }
    await recordPayment(fromId, pay.total_amount, pay.telegram_payment_charge_id, false);
    await telegram.sendMessage(
      chatId,
      `الله يجزاك خير على دعمك ⚡️\nوصلك ${pay.total_amount} نجمة.`,
      { reply_markup: await keysFor(fromId) },
    );
    const { bumpTip } = await import("./growth.server");
    await bumpTip(fromId, chatId).catch(() => undefined);
    return;
  }

  const member = await upsertMember({
    tgId: fromId,
    username: from?.username,
    firstName: from?.first_name,
  });
  const { touchSession } = await import("./growth.server");
  void touchSession(fromId).catch(() => null);
  const growthText =
    text === "رحلتي" ||
    text === "إنجازاتي" ||
    text === "حالة برق" ||
    text === "أعجبني" ||
    text === "المعجبون" ||
    text.startsWith("/start") ||
    text === "/status" ||
    text.startsWith("/ops") ||
    text === "كيف يعمل" ||
    text === "القائمة" ||
    text === "بدء";
  if (!owner && LAUNCH_MAX > 0) {
    const n = await cachedMemberCount();
    if (n > LAUNCH_MAX) {
      const seat = await launchSeat(fromId).catch(() => n);
      if (seat > LAUNCH_MAX && text !== "حالة برق" && !text.startsWith("/status")) {
        await telegram.sendMessage(
          chatId,
          `الإطلاق محدود حاليًا (${LAUNCH_MAX} مستخدم).\nأنت على قائمة الانتظار. الدعم @${SUPPORT_USERNAME}`,
        );
        return;
      }
    }
  }
  if (MAINTENANCE && !owner && !growthText) {
    await sendMaintenance(chatId);
    return;
  }
  const bannedAction = bannedMessageAction(text);
  if (blocksBannedJob(member.is_banned, owner) && bannedAction === "block") {
    await telegram.sendMessage(chatId, bannedUserMessage(SUPPORT_USERNAME));
    return;
  }
  if (blocksBannedJob(member.is_banned, owner) && bannedAction === "appeal") {
    const { appealBan } = await import("./store.server");
    const note = parseAppealNote(text);
    const result = await appealBan(fromId, note);
    await telegram.sendMessage(chatId, appealReceivedMessage(result.ok, SUPPORT_USERNAME));
    if (result.ok && result.fresh) {
      const notice = ownerAppealNotice(String(fromId), note);
      await Promise.all(OWNER_IDS.map((oid) => telegram.sendMessage(Number(oid), notice).catch(() => undefined)));
    }
    return;
  }
  if (member.isNew && !owner && !text.startsWith("/start")) {
    await telegram.sendMessage(
      chatId,
      `أهلًا بك في برق ⚡️\nالبوت مجاني. الصق أي رابط فيديو.\nBarq AI معك — ${BARQ_AI_DAILY} رسائل يوميًا.`,
      { reply_markup: FREE_KEYBOARD },
    );
  }

  if (msg.chat.type !== "private") {
    if (text.startsWith("/start")) {
      await telegram.sendMessage(chatId, "برق للشات الخاص فقط. افتح @barq_ibot من الخاص.");
    }
    return;
  }

  const downloadUrls = urlsFromMessage(msg);
  if (downloadUrls[0]) {
    clearAwait(fromId);
    const batch = [...new Set(downloadUrls)].slice(0, 5);
    if (batch.length > 1) {
      await telegram.sendMessage(
        chatId,
        downloadUrls.length > 5
          ? `وصلت ${downloadUrls.length} روابط. أجهّز أول 5، كل واحد لحاله.`
          : `وصلت ${batch.length} روابط. أجهّزها واحد واحد.`,
      );
    }
    for (let i = 0; i < batch.length; i += 1) {
      await handleDownload(chatId, fromId, batch[i]!, member, i === 0 ? updateId : undefined);
    }
    return;
  }

  if (owner) {
    const { bindNewsFromForward, bindVaultFromForward, bindVaultFromText, vaultBindHelp } = await import("./vault.server");
    const newsBound = await bindNewsFromForward(msg);
    if (newsBound) {
      await telegram.sendMessage(chatId, `قناة التحديثات رُبطت ⚡️\n${newsBound}`);
      return;
    }
    const bound = await bindVaultFromForward(msg);
    if (bound) {
      await telegram.sendMessage(chatId, `قناة التخزين رُبطت ⚡️\n${bound}\nكل تحميل يُنسخ هناك مع معرّف تليجرام فقط.`);
      return;
    }
    const byId = text ? await bindVaultFromText(text) : null;
    if (byId) {
      await telegram.sendMessage(chatId, `قناة التخزين رُبطت ⚡️\n${byId}`);
      return;
    }
    if (text === "انشر التحديث" || text === "نشر التحديث" || text.startsWith("/news")) {
      const ch = await import("./channel.server");
      const posted = await swallowSideEffect(() => ch.postNews(ch.RELEASE_NOTES_V14, true));
      if (posted?.messageId) {
        await telegram.sendMessage(chatId, `نُشر v1.4 في قناة التحديثات (رسالة ${posted.messageId}).`).catch(() => undefined);
      } else {
        const status = await swallowSideEffect(() => ch.newsPublishStatus());
        await telegram.sendMessage(chatId, status?.reason || "تعذر النشر في قناة التحديثات.").catch(() => undefined);
      }
      return;
    }
    if (text === "ربط التخزين" || text.startsWith("/vault")) {
      const { probeAndBindVault, vaultChatId, vaultBindHelp } = await import("./vault.server");
      const bound = await probeAndBindVault();
      const id = bound || (await vaultChatId());
      await telegram.sendMessage(
        chatId,
        id
          ? `القناة مربوطة ⚡️\n${id}\nكل تحميل يروح هناك.`
          : vaultBindHelp(),
        { reply_markup: await keysFor(fromId, member) },
      );
      return;
    }
  }

  if (!owner && OWNER_ONLY_LABELS.has(text)) {
    await telegram.sendMessage(chatId, "هذا القسم للمالك فقط. أزرارك تحت.", {
      reply_markup: await keysFor(fromId, member),
    });
    return;
  }

  let pending = peekAwait(fromId);
  const earlyUrls = urlsFromMessage(msg);
  const intent = classifyIntent({
    text,
    urls: earlyUrls,
    hasFile: false,
    pending,
  });
  if (pending === "hostfile" && intent === "download") {
    clearAwait(fromId);
    pending = undefined;
  }
  if (pending === "feedback") {
    clearAwait(fromId);
    const { saveFeedback } = await import("./growth.server");
    await saveFeedback({ tgId: fromId, comment: text.slice(0, 500), stage: "complaint" });
    await telegram.sendMessage(chatId, `وصلت. راسل الدعم إذا تبي تفاصيل أكثر: @${SUPPORT_USERNAME}`);
    await telegram
      .sendMessage(
        Number(OWNER_TG_ID),
        `ملاحظة ⚡️\nمن ${member.first_name ?? ""} ${member.username ? `@${member.username}` : ""}\nالمعرف: ${fromId}\n${text.slice(0, 500)}`,
      )
      .catch(() => undefined);
    return;
  }
  if (pending === "lib_search") {
    clearAwait(fromId);
    const { searchHistory } = await import("./library.server");
    const rows = await searchHistory(fromId, text);
    await sendHistoryList(chatId, fromId, rows, rows.length ? `نتائج البحث عن «${text.slice(0, 40)}»` : "ما في نتائج");
    return;
  }
  if (pending === "hostfile") {
    const { fileFromMessage } = await import("./host.server");
    const decision = decideHostfile({
      text,
      hasUrl: urlsFromMessage(msg).length > 0,
      hasFile: Boolean(fileFromMessage(msg)),
    });
    if (decision === "upload") {
      const ok = await hostIncomingIfAny(chatId, fromId, msg);
      clearAwait(fromId);
      if (ok) return;
    } else if (decision === "download") {
      clearAwait(fromId);
    } else if (decision === "wait") {
      await telegram.sendMessage(
        chatId,
        "أرسل الملف نفسه للرابط المؤقت، أو الصق رابط فيديو للتحميل.",
        { reply_markup: await keysFor(fromId, member) },
      );
      return;
    }
  }
  if (pending === "code") {
    clearAwait(fromId);
    const raw = text.replace(/^\/code\s*/i, "");
    const result = await redeemCode(fromId, raw);
    await telegram.sendMessage(chatId, result.message, { reply_markup: await keysFor(fromId, member) });
    return;
  }
  if (pending && owner) {
    clearAwait(fromId);
    const handled = await handleOwnerAwait(chatId, fromId, pending, text);
    if (handled) return;
  }

  if (text === "البلاغات" || text === "تذاكر الدعم" || text === "المهام" || text === "مراقبة" || text === "المراقبة") {
    if (text === "مراقبة" || text === "المراقبة") {
      const { actorRole } = await import("./acl.server");
      const { can } = await import("./roles.server");
      const role = owner ? "owner" : await actorRole(fromId);
      if (owner || can(role, "errors.read")) {
        await sendWatch(chatId, fromId);
        return;
      }
    } else {
      const mapped = text === "البلاغات" ? "/reports" : text === "تذاكر الدعم" ? "/tickets" : "/jobs";
      await handleAdminCommand(chatId, mapped, fromId);
      return;
    }
  }

  if (text.startsWith("/")) {
    const staff =
      owner ||
      (await (async () => {
        const { actorRole } = await import("./acl.server");
        const { isStaff } = await import("./roles.server");
        return isStaff(await actorRole(fromId));
      })());
    if (staff) {
      if (
        text.startsWith("/admin") ||
        text.startsWith("/panel") ||
        text.startsWith("/grok") ||
        text.startsWith("/broadcast") ||
        text.startsWith("/newcode") ||
        text.startsWith("/grant") ||
        text.startsWith("/ban") ||
        text.startsWith("/unban") ||
        text.startsWith("/appeal") ||
        text.startsWith("/jobs") ||
        text.startsWith("/retry") ||
        text.startsWith("/tickets") ||
        text.startsWith("/reports") ||
        text.startsWith("/block")
      ) {
        await handleAdminCommand(chatId, text, fromId);
        return;
      }
    }
  }

  if (owner) {
    if (text.startsWith("/watch") || text === "المراقبة") {
      await sendWatch(chatId, fromId);
      return;
    }
    if (text.startsWith("/stats") || text === "الإحصائيات") {
      await sendOwnerPanel(chatId);
      return;
    }
    if (text === "المعجبون") {
      const { sendLikesPanel } = await import("./growth.server");
      await sendLikesPanel(chatId);
      return;
    }
    if (text === "لوحة التحكم" || text.startsWith("/panel")) {
      await sendOwnerPanel(chatId);
      return;
    }
    if (text === "أكواد") {
      await sendOwnerCodes(chatId);
      return;
    }
    if (text === "اشتراكات") {
      await sendOwnerSubs(chatId);
      return;
    }
    if (text === "إرسال للجميع") {
      await askBroadcast(chatId, fromId);
      return;
    }
    if (text === "النظام") {
      await sendOwnerSys(chatId);
      return;
    }
    if (text === "مسح شامل") {
      await telegram.sendMessage(
        chatId,
        "مسح شامل للجميع\n\nيمسح العدادات والوظائف والروابط عند الكل. الأعضاء يبقون.",
        {
          reply_markup: inlineKeyboard([
            [{ text: "تأكيد المسح للجميع", callback_data: "adm:wipe_ok" }],
            [{ text: "إلغاء", callback_data: "adm:home" }],
          ]),
        },
      );
      return;
    }
    if (text === "القناة والمجاني") {
      await sendOwnerChannel(chatId);
      return;
    }
    if (text === "أخبار القناة") {
      await sendOwnerNews(chatId);
      return;
    }
    if (text === "الإعلان") {
      await sendOwnerAds(chatId);
      return;
    }
  }
  if (text === "لخّصه وكابشن" || text === "لخّصه" || text === "لخصه" || text === "تلخيص" || text === "تحليل الفيديو") {
    await telegram.sendChatAction(chatId, "typing");
    if (text === "لخّصه وكابشن") {
      const { packClip } = await import("./analyze.server");
      await telegram.sendMessage(chatId, (await packClip(fromId)).slice(0, 4000), {
        reply_markup: await keysFor(fromId, member),
      });
      return;
    }
    await handleAnalyze(chatId, fromId, member);
    return;
  }
  if (text === "كابشن" || text === "تجهيز للنشر") {
    await telegram.sendChatAction(chatId, "typing");
    await handleStudio(chatId, fromId, member);
    return;
  }
  if (text === "جروك" || text === "Barq AI" || text.startsWith("/grok")) {
    if (owner) {
      await enterGrokMode(chatId, fromId);
      return;
    }
  }
  if (owner && (text === "إنهاء جروك" || text === "إنهاء Barq AI" || text === "إنهاء المحادثة")) {
    await exitGrokMode(chatId, fromId);
    return;
  }
  if (owner && text === "النماذج") {
    await sendGrokPanel(chatId);
    return;
  }

  if (owner && inGrokMode(fromId)) {
    if (text.startsWith("/start") || text === "القائمة" || text === "بدء") {
      await exitGrokMode(chatId, fromId);
      await sendStart(chatId, member);
      return;
    }
    if (text === "لوحة التحكم" || text.startsWith("/panel") || text.startsWith("/admin")) {
      await sendOwnerPanel(chatId);
      return;
    }
    if (text === "المراقبة" || text.startsWith("/watch")) {
      await sendWatch(chatId, fromId);
      return;
    }
    if (text === "انشر في القناة") {
      const channel = await import("./channel.server");
      const posted = await swallowSideEffect(() => channel.copyOwnerMediaToChannel());
      if (posted?.messageId) {
        await telegram
          .sendMessage(chatId, `نُشر في القناة (رسالة ${posted.messageId}).`, {
            reply_markup: GROK_KEYBOARD,
          })
          .catch(() => undefined);
      } else {
        awaitMap().set(fromId, "news_post");
        await telegram
          .sendMessage(chatId, "أرسل نص التحديث أو أرسل صورة/فيديو ثم اضغط انشر في القناة.")
          .catch(() => undefined);
      }
      return;
    }
    if (text === "اسحب فائز") {
      try {
        const channel = await import("./channel.server");
        const result = await channel.drawContest();
        await telegram.sendMessage(chatId, `سُحب ${result.winners.length} فائز لمسابقة «${result.title}».`, {
          reply_markup: GROK_KEYBOARD,
        });
      } catch (err) {
        await telegram.sendMessage(chatId, err instanceof Error ? err.message : "تعذر السحب", {
          reply_markup: GROK_KEYBOARD,
        });
      }
      return;
    }
    const mediaKind = ownerMediaKind(msg);
    if (mediaKind) {
      setLastOwnerMedia(chatId, msg.message_id, mediaKind);
      if (/انشر|للقناة|انزلها|انزله/.test(text)) {
        try {
          const channel = await import("./channel.server");
          await channel.copyOwnerMediaToChannel(text);
          await telegram.sendMessage(chatId, "نُشر في القناة.", { reply_markup: GROK_KEYBOARD }).catch(() => undefined);
        } catch (err) {
          await telegram
            .sendMessage(chatId, err instanceof Error ? err.message : "تعذر النشر", {
              reply_markup: GROK_KEYBOARD,
            })
            .catch(() => undefined);
        }
        return;
      }
      await hostIncomingIfAny(chatId, fromId, msg);
      return;
    }
    const grokUrls = [...new Set(urlsFromMessage(msg))].slice(0, 5);
    if (grokUrls[0]) {
      for (let i = 0; i < grokUrls.length; i += 1) {
        await handleDownload(chatId, fromId, grokUrls[i]!, member, i === 0 ? updateId : undefined);
      }
      return;
    }
    await handleOwnerChat(chatId, text || "(رسالة بلا نص)", fromId);
    return;
  }

  if (!owner && !isOwnerId(fromId)) {
    const s = await botSettings();
    if (s.paused && !text.startsWith("/start")) {
      await telegram.sendMessage(chatId, "البوت متوقف مؤقتًا. حاول لاحقًا.", {
        reply_markup: await keysFor(fromId, member),
      });
      return;
    }
  }

  if (text.startsWith("/start") || text === "القائمة" || text === "بدء") {
    clearAwait(fromId);
    const arg = text.replace(/^\/start(?:@\w+)?\s*/i, "").trim();
    await sendStart(chatId, member);
    if (/^sub$/i.test(arg)) {
      await sendSubInvoice(chatId, fromId);
      return;
    }
    if (/^ref/i.test(arg)) {
      const { applyReferral, ensureReferral } = await import("./product.server");
      const ok = await applyReferral(fromId, arg);
      const me = await ensureReferral(fromId);
      await telegram.sendMessage(
        chatId,
        ok
          ? "تم احتساب الدعوة. صديقك حصل على 3 تحميلات إضافية."
          : `رابط دعوتك:\nhttps://t.me/${BOT_USERNAME}?start=ref_${me.code}`,
      );
      return;
    }
    if (arg && arg !== "القائمة" && arg !== "بدء" && !/^(try|channel|trial)$/i.test(arg)) {
      const result = await redeemCode(fromId, arg);
      await telegram.sendMessage(chatId, result.message, { reply_markup: await keysFor(fromId, member) });
    }
    return;
  }
  if (text === "رحلتي" || text.startsWith("/journey")) {
    const g = await import("./growth.server");
    await g.sendJourneyList(chatId, fromId);
    return;
  }
  if (text === "إنجازاتي" || text.startsWith("/ach")) {
    const g = await import("./growth.server");
    await g.sendAchievements(chatId, fromId);
    return;
  }
  if (text === "أعجبني" || text.startsWith("/like")) {
    const g = await import("./growth.server");
    await g.sendLikesPanel(chatId);
    return;
  }
  if (text === "حالة برق" || text.startsWith("/ops") || text === "/status") {
    const { sendSystemStatus } = await import("./ops.server");
    await sendSystemStatus(chatId);
    return;
  }
  if (text.startsWith("/help") || text === "كيف يعمل") {
    const s = await botSettings();
    await telegram.sendMessage(chatId, howText(s.freeDownloads, s.requiredChannel, roleOf(fromId, member)), {
      reply_markup: await keysFor(fromId, member),
    });
    return;
  }
  if (text.startsWith("/support") || text === SUPPORT_BTN) {
    await sendSupport(chatId, fromId, member);
    return;
  }
  if (text === "Barq AI" || text.startsWith("/ai") || text === "جروك" || text.startsWith("/grok")) {
    if (owner) {
      await enterGrokMode(chatId, fromId);
      return;
    }
    await telegram.sendMessage(
      chatId,
      `أنا برق AI. اكتب أي شيء: لخّص الفيديو، ابحث عن مقطع، اشرح، أو حوّل فكرة.\n${BARQ_AI_DAILY} رسائل يوميًا. التحميل مجاني — الصق الرابط.`,
      { reply_markup: await keysFor(fromId, member) },
    );
    return;
  }
  if (text.startsWith("/live") || text === "البث" || text === "Live Recorder") {
    await handleLive(chatId, fromId, text, member);
    return;
  }
  if (text === "دعوة" || text.startsWith("/invite") || text === "إحالة") {
    const { ensureReferral } = await import("./product.server");
    const me = await ensureReferral(fromId);
    await telegram.sendMessage(
      chatId,
      `رابط دعوتك ⚡️\nhttps://t.me/${BOT_USERNAME}?start=ref_${me.code}\n\nكل صديق = 3 تحميلات لك.\nكل 5 دعوات = أسبوع برو مجاني.\nدعواتك الآن: ${me.invites}`,
      { reply_markup: await keysFor(fromId, member) },
    );
    return;
  }
  if (text === "كوبون" || text === "كوبونات") {
    awaitMap().set(fromId, "code");
    await telegram.sendMessage(chatId, "أرسل كود الكوبون الآن.", { reply_markup: await keysFor(fromId, member) });
    return;
  }
  if (text === "نقاطي" || text.startsWith("/points")) {
    await handlePoints(chatId, fromId);
    return;
  }
  if (text === "الموقع") {
    await telegram.sendMessage(chatId, "الموقع\nhttps://abdulrhman.ai\nالصق الرابط هناك إذا كان المقطع كبيرًا.", {
      reply_markup: await keysFor(fromId, member),
    });
    return;
  }
  if (text === "حسابي" || text.startsWith("/account")) {
    await handleAccount(chatId, fromId);
    return;
  }
  if (text === "سجلي" || text === "سجليّ" || text.startsWith("/history") || text === "سجل التحميل") {
    const { listHistory } = await import("./library.server");
    await sendHistoryList(chatId, fromId, await listHistory(fromId, 20), "آخر 20 تحميل");
    return;
  }
  if (text === "حدّي" || text === "حدي" || text.startsWith("/quota") || text === "حد التحميل") {
    await sendMonthlyCard(chatId, fromId, member);
    return;
  }
  if (text === "طابوري" || text.startsWith("/queue")) {
    const { listUserJobs } = await import("../jobs/queue.server");
    const jobs = await listUserJobs(fromId, 8);
    await telegram.sendMessage(
      chatId,
      jobs.length ? `طابورك\n${jobs.map((j, i) => `${i + 1}. ${j.status} — ${(j.url || "").slice(0, 48)}`).join("\n")}` : "طابورك فارغ.",
    );
    return;
  }
  if (text === "ادعُ صديق" || text === "ادع صديق" || text.startsWith("/ref") || text === "إحالة") {
    const { ensureReferral } = await import("./product.server");
    const me = await ensureReferral(fromId);
    await telegram.sendMessage(
      chatId,
      `رابط دعوتك\nhttps://t.me/${BOT_USERNAME}?start=ref_${me.code}\nكل صديق يسجّل = 3 تحميلات لك.\nعمولة 20% تُسجَّل ولا تُصرف حتى الإطلاق.\nدعواتك: ${me.invites} · رصيد عمولة: ${me.credit}`,
    );
    return;
  }
  if (text.startsWith("/trial") || text === "تجربة 7 أيام") {
    const { markTrialUsed } = await import("./product.server");
    const fresh = await markTrialUsed(fromId);
    if (!fresh) {
      await telegram.sendMessage(chatId, "استخدمت التجربة المجانية سابقًا.");
      return;
    }
    await grantDays(fromId, 7);
    await telegram.sendMessage(chatId, "تجربة بلس 7 أيام اشتغلت. بدون بطاقة.");
    return;
  }
  if (text === "موصى به" || text.startsWith("/top")) {
    const { analyticsReport } = await import("./product.server");
    await telegram.sendMessage(chatId, `أعلى التحميلات هذا الأسبوع:\n${await analyticsReport()}`);
    return;
  }
  if (text === "بحث في السجل" || text.startsWith("/find")) {
    awaitMap().set(fromId, "lib_search");
    await telegram.sendMessage(chatId, "أرسل كلمة البحث: عنوان أو رابط أو منصة.");
    return;
  }
  if (text === "رابط مؤقت" || text === "رابط مختصر 24س" || text === "اشغله" || text.startsWith("/short")) {
    await sendShortLink(chatId, fromId);
    return;
  }
  if (text === "رفع ملف" || text.startsWith("/host")) {
    setAwait(fromId, "hostfile");
    await telegram.sendMessage(
      chatId,
      "أرسل الملف الآن (صورة أو فيديو أو مضغوط أو تطبيق).\nرابط مباشر 24 ساعة · حد 20 ميغا.",
      { reply_markup: await keysFor(fromId, member) },
    );
    return;
  }
  if (text === AD_BTN || text.startsWith("/ad")) {
    await sendAdOffer(chatId, fromId, member);
    return;
  }
  if (text === "حالة الاشتراك") {
    await telegram.sendMessage(chatId, subStatusText(member), {
      reply_markup: await keysFor(fromId, member),
    });
    return;
  }
  if (text.startsWith("/join")) {
    await handleJoinCheck(chatId, fromId, member);
    return;
  }
  if (text.startsWith("/sub") || text === "الاشتراك" || text === "اشترك الآن" || text === "تجديد الاشتراك") {
    await handleSubscription(chatId, fromId);
    return;
  }
  if (text.startsWith("/code") || text === "كود تفعيل") {
    const rest = text.replace(/^\/code(@\w+)?\s*/i, "").trim();
    if (rest && rest !== "كود تفعيل") {
      const result = await redeemCode(fromId, rest);
      await telegram.sendMessage(chatId, result.message, { reply_markup: await keysFor(fromId, member) });
      return;
    }
    awaitMap().set(fromId, "code");
    await telegram.sendMessage(chatId, "أرسل كود التفعيل الآن.");
    return;
  }

  const urls = [...new Set(urlsFromMessage(msg))].slice(0, 5);
  if (urls.length === 0) {
    const mediaOnly =
      !text &&
      Boolean(msg.sticker || msg.animation || msg.photo || msg.video || msg.voice || msg.video_note || msg.audio);
    if (mediaOnly && peekAwait(fromId) !== "hostfile") {
      await telegram.sendMessage(chatId, "الصق رابط المقطع.", {
        reply_markup: await keysFor(fromId, member),
      });
      return;
    }
    if (peekAwait(fromId) === "hostfile" && (await hostIncomingIfAny(chatId, fromId, msg))) {
      clearAwait(fromId);
      return;
    }
    if (owner) {
      await handleOwnerChat(chatId, text || "(رسالة بلا نص)", fromId);
      return;
    }
    await handleBarqChat(chatId, fromId, text || "مرحبا");
    return;
  }

  for (let i = 0; i < urls.length; i += 1) {
    await handleDownload(chatId, fromId, urls[i]!, member, i === 0 ? updateId : undefined);
  }
}

function chatIdFromUpdate(update: TgUpdate): number | null {
  return (
    update.message?.chat.id ??
    update.callback_query?.message?.chat.id ??
    update.callback_query?.from.id ??
    update.pre_checkout_query?.from.id ??
    null
  );
}

async function ackStart(_update: TgUpdate): Promise<boolean> {
  return false;
}

export async function handleUpdate(update: TgUpdate) {
  void import("./remind.server")
    .then((m) => m.maybeHourlyReminder())
    .catch(() => undefined);
  await ackStart(update).catch(() => undefined);
  const { receiveTelegramUpdate, markTelegramUpdateProcessed, markTelegramUpdateFailed, updateTypeOf } =
    await import("./telegram-updates.server");
  const urls = update.message ? urlsFromMessage(update.message) : [];
  try {
    if (update.message && urls[0]) {
      await handleMessage(update.message, update.update_id);
      return;
    }
    let duplicate = false;
    try {
      const kind = await receiveTelegramUpdate(update.update_id, updateTypeOf(update));
      duplicate = kind === "duplicate";
    } catch {
      // Fail open: a down DB must not swallow /start.
      duplicate = false;
    }
    if (duplicate) return;
    if (update.pre_checkout_query) {
      const payload = update.pre_checkout_query.invoice_payload || "";
      const ok =
        payload.startsWith("sub:") ||
        payload.startsWith("gift:") ||
        payload.startsWith("giftcode:") ||
        payload.startsWith("tip:");
      await telegram.answerPreCheckout(
        update.pre_checkout_query.id,
        ok,
        ok ? undefined : "فاتورة غير صالحة",
      );
      await markTelegramUpdateProcessed(update.update_id);
      return;
    }
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      await markTelegramUpdateProcessed(update.update_id);
      return;
    }
    if (update.my_chat_member) {
      const { handleBotMembership } = await import("./vault.server");
      await handleBotMembership(update.my_chat_member);
      await markTelegramUpdateProcessed(update.update_id);
      return;
    }
    if (update.channel_post) {
      const { handleChannelPost } = await import("./vault.server");
      await handleChannelPost(update.channel_post);
      await markTelegramUpdateProcessed(update.update_id);
      return;
    }
    if (update.message) {
      await handleMessage(update.message, update.update_id);
    }
    await markTelegramUpdateProcessed(update.update_id);
  } catch (err) {
    markError(err instanceof Error ? err.message : "update failed");
    await markTelegramUpdateFailed(
      update.update_id,
      err instanceof Error ? err.message : "update failed",
    ).catch(() => undefined);
    const chatId = chatIdFromUpdate(update);
    if (chatId != null) {
      await telegram.sendMessage(chatId, ERROR_MESSAGES.UNKNOWN_ERROR).catch(() => undefined);
    }
    if (update.callback_query?.id) {
      await telegram.answerCallback(update.callback_query.id).catch(() => undefined);
    }
  }
}
