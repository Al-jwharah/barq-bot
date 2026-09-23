import { waitUntil } from "@vercel/functions";
import { extractMedia } from "../media/extract";
import type { ExtractResult } from "../media/types";
import { extractWithYtdlp } from "../media/ytdlp";
import { SUPPORT_URL } from "../bot/config.server";
import {
  assertSafeMedia,
  deliver,
  handleBlocked,
  sendAfterDownload,
  sendPlayCard,
} from "../bot/handle.server";
import { MediaBlockedError } from "../bot/safety";
import { logEvent, requestId } from "../bot/observability.server";
import { bumpDownload, logDownload } from "../bot/store.server";
import { inlineKeyboard, telegram } from "../bot/telegram.server";
import { markError, markProcessed } from "../bot/state";
import { claimNextJob, finishJob, retryOrFail, applyJobQuota, markJobUploading, scheduleJobRetry, getJob, type DownloadJob } from "./queue.server";
import { jobTimeoutMs } from "./job-status";
import { killJobProcess, withJobId } from "./proc-registry";
import { userFailMessage, userRetryMessage } from "./retry-policy";
import { emit } from "../events/bus";

void import("../events/download-completed");

function forceTikTokFile(result: ExtractResult): ExtractResult {
  if (result.platform !== "tiktok") return result;
  const id = result.id && /^\d{8,30}$/.test(String(result.id)) ? String(result.id) : "";
  if (!id) return result;
  const video = result.items.find((item) => item.kind === "video" || item.kind === "gif");
  if (!video) return result;
  const hd = `https://www.tikwm.com/video/media/hdplay/${id}.mp4`;
  return {
    ...result,
    items: [
      {
        ...video,
        kind: "video",
        url: hd,
        variants: [{ url: hd, quality: "HD", contentType: "video/mp4" }],
      },
    ],
  };
}

const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

export function attachWaitUntil(task: Promise<unknown>): boolean {
  try {
    const ctx = (
      globalThis as unknown as Record<PropertyKey, { get?: () => { waitUntil?: (p: Promise<unknown>) => unknown } }>
    )[REQUEST_CONTEXT]?.get?.();
    if (typeof ctx?.waitUntil === "function") {
      ctx.waitUntil(task);
      return true;
    }
    waitUntil(task);
  } catch {
    return false;
  }
  return false;
}

async function editStatus(chatId: number, messageId: number | null, text: string) {
  if (!messageId) {
    await telegram.sendMessage(chatId, text).catch(() => undefined);
    return;
  }
  await telegram.editMessageText(chatId, messageId, text).catch(() => undefined);
}

async function withDeadline<T>(jobId: string, ms: number, fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let timedOut = false;
  const budget = Number.isFinite(ms) && ms > 0 ? Math.trunc(ms) : jobTimeoutMs();
  const work = fn();
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        if (settled) return;
        settled = true;
        void killJobProcess(jobId).finally(() => reject(new Error("DOWNLOAD_TIMEOUT")));
      }, budget);
      work.then(
        (value) => {
          if (timedOut || settled) return;
          settled = true;
          resolve(value);
        },
        (err) => {
          if (timedOut || settled) return;
          settled = true;
          reject(err);
        },
      );
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runOnce(job: DownloadJob): Promise<"ok"> {
  const chatId = Number(job.chat_id);
  const fromId = Number(job.tg_id);
  const mid = job.status_message_id;
  const { looksLikeLiveStream, progressStatus, cachedExtract, saveExtractCache } = await import("../bot/product.server");
  if (looksLikeLiveStream(job.url)) {
    throw new Error("هذا بث مباشر. أرسل المقطع بعد انتهائه، أو كليب جاهز.");
  }
  await editStatus(chatId, mid, progressStatus("extract"));
  await assertSafeMedia(job.url);
  const { cachedTelegramFile } = await import("../bot/file-cache.server");
  const hit = await cachedTelegramFile(job.url).catch(() => null);
  if (hit?.fileId) {
    await editStatus(chatId, mid, progressStatus("upload", "من الكاش"));
    await markJobUploading(job.id).catch(() => undefined);
    let accountUrl: string | undefined;
    try {
      const { issueAccountLink } = await import("../bot/account.server");
      accountUrl = await issueAccountLink(fromId);
    } catch {
      accountUrl = undefined;
    }
    const { clipActionRows, clipCaption } = await import("../bot/brand");
    const { inlineKeyboard } = await import("../bot/telegram.server");
    const cap = clipCaption("barq_ibot");
    const markup = inlineKeyboard(clipActionRows(accountUrl, job.url));
    if (hit.kind === "audio") await telegram.sendAudioUrl(chatId, hit.fileId, { caption: cap, reply_markup: markup });
    else await telegram.sendVideoUrl(chatId, hit.fileId, { caption: cap, supports_streaming: true, reply_markup: markup });
    await sendAfterDownload(chatId);
    if (await applyJobQuota(job.id)) {
      await bumpDownload(fromId);
      const { bumpDownloadOk } = await import("../bot/growth.server");
      await bumpDownloadOk(fromId).catch(() => undefined);
      emit("download.completed", { tgId: fromId, url: job.url });
    }
    await logDownload({ tgId: fromId, url: job.url, ok: true, platform: "cache" });
    markProcessed();
    if (mid) await telegram.deleteMessage(chatId, mid).catch(() => undefined);
    return "ok";
  }
  await editStatus(chatId, mid, progressStatus("extract"));
  let result = await cachedExtract(job.url).catch(() => null);
  const cachedMedia = result?.items?.[0]?.url || "";
  if (!result || /tiktokcdn|tiktokv\.com|byteicdn|tikcdn\.io/i.test(cachedMedia)) {
    result = await extractMedia(job.url);
  }
  result = forceTikTokFile(result);
  await saveExtractCache(job.url, result).catch(() => undefined);
  await assertSafeMedia(job.url, result);
  const live = await getJob(job.id);
  if (live?.status === "cancelled") throw new Error("cancelled");
  await markJobUploading(job.id).catch(() => undefined);
  await editStatus(chatId, mid, progressStatus("upload"));
  let ids: number[] = [];
  try {
    ids = await deliver(chatId, result, false, fromId);
  } catch (sendErr) {
    if (sendErr instanceof MediaBlockedError) throw sendErr;
    if (result.items.length) throw sendErr;
    result = await extractWithYtdlp(job.url, result.platform);
    await assertSafeMedia(job.url, result);
    ids = await deliver(chatId, result, false, fromId);
  }
  const { archiveDelivered } = await import("../bot/vault.server");
  const media = result.items.find((i) => i.kind === "video" || i.kind === "gif") || result.items[0];
  const { getMember } = await import("../bot/store.server");
  const person = await getMember(fromId).catch(() => null);
  await archiveDelivered({
    fromChatId: chatId,
    messageIds: ids,
    sourceUrl: job.url,
    mediaUrl: media?.url,
    kind: media?.kind,
    who: {
      id: fromId,
      name: person?.first_name,
      username: person?.username,
    },
  }).catch(() => undefined);
  await sendPlayCard(chatId, fromId, result).catch(() => undefined);
  if (await applyJobQuota(job.id)) {
    await bumpDownload(fromId);
    const { bumpDownloadOk } = await import("../bot/growth.server");
    await bumpDownloadOk(fromId).catch(() => undefined);
    emit("download.completed", { tgId: fromId, url: job.url });
  }
  await logDownload({ tgId: fromId, url: job.url, platform: result.platform, ok: true });
  markProcessed();
  if (mid) await telegram.deleteMessage(chatId, mid).catch(() => undefined);
  await sendAfterDownload(chatId);
  return "ok";
}

export async function processDownloadJob(id?: string): Promise<{ id?: string; status: string }> {
  const rid = requestId();
  const started = Date.now();
  const job = await claimNextJob(id);
  if (!job) return { status: "empty" };
  const chatId = Number(job.chat_id);
  const fromId = Number(job.tg_id);
  try {
    await withJobId(job.id, () => withDeadline(job.id, jobTimeoutMs(), () => runOnce(job)));
    let won = await finishJob(job.id, "completed");
    if (!won) {
      await markJobUploading(job.id).catch(() => undefined);
      won = await finishJob(job.id, "completed");
    }
    if (!won) {
      const live = await getJob(job.id);
      return { id: job.id, status: live?.status ?? "cancelled" };
    }
    if (job.update_id != null) {
      const { markTelegramUpdateProcessed } = await import("../bot/telegram-updates.server");
      await markTelegramUpdateProcessed(job.update_id).catch(() => undefined);
    }
    await logEvent({
      requestId: rid,
      tgId: fromId,
      action: "download",
      status: "completed",
      durationMs: Date.now() - started,
      detail: job.url.slice(0, 180),
    });
    return { id: job.id, status: "completed" };
  } catch (err) {
    const live = await getJob(job.id).catch(() => null);
    if (live?.status === "cancelled" || /^cancelled$/i.test(err instanceof Error ? err.message : "")) {
      return { id: job.id, status: "cancelled" };
    }
    if (err instanceof MediaBlockedError) {
      const cancelled = await finishJob(job.id, "cancelled", err.evidence);
      if (!cancelled) await finishJob(job.id, "failed", err.evidence);
      if (job.update_id != null) {
        const { markTelegramUpdateProcessed } = await import("../bot/telegram-updates.server");
        await markTelegramUpdateProcessed(job.update_id).catch(() => undefined);
      }
      if (job.status_message_id) {
        await telegram.deleteMessage(chatId, job.status_message_id).catch(() => undefined);
      }
      await handleBlocked(chatId, fromId, job.url, err);
      await logEvent({
        requestId: rid,
        tgId: fromId,
        action: "download",
        status: "cancelled",
        durationMs: Date.now() - started,
      });
      return { id: job.id, status: "cancelled" };
    }
    const technical = (err instanceof Error ? err.message : "failed").split("\n")[0]!;
    const { isGoneError, isCopyrightError, recordDeadLink } = await import("../bot/product.server");
    if (isGoneError(technical) || isCopyrightError(technical)) {
      await recordDeadLink(job.url, technical).catch(() => undefined);
    }
    const shown = userFailMessage(technical);
    const next = await retryOrFail(job, technical);
    markError(technical);
    await logDownload({ tgId: fromId, url: job.url, ok: false, reason: technical.slice(0, 180) }).catch(() => undefined);
    if (next === "failed") {
      const { isRetryableError } = await import("./retry-policy");
      if (isRetryableError(technical)) {
        const { refundUsage } = await import("../bot/usage.server");
        await refundUsage(fromId, "download").catch(() => undefined);
      }
    }
    await logEvent({
      requestId: rid,
      tgId: fromId,
      action: "download",
      status: next,
      durationMs: Date.now() - started,
      detail: technical.slice(0, 180),
    });
    if (next === "retry") {
      const delay = await scheduleJobRetry(job.id, job.attempts);
      await editStatus(chatId, job.status_message_id, userRetryMessage(job.attempts, job.max_attempts));
      void delay;
      return { id: job.id, status: "retry" };
    }
    if (job.update_id != null) {
      const { markTelegramUpdateFailed } = await import("../bot/telegram-updates.server");
      await markTelegramUpdateFailed(job.update_id, shown).catch(() => undefined);
    }
    const page = `https://abdulrhman.ai/?url=${encodeURIComponent(job.url)}`;
    const withLink = `${shown}\n\nإذا ما نزل هنا، افتحه من الموقع:\n${page}`;
    const failKb = inlineKeyboard([
      [
        { text: "إعادة المحاولة", callback_data: `job:retry:${job.id}` },
        { text: "تحميل من الموقع", url: page },
      ],
      [{ text: "الدعم", url: SUPPORT_URL }],
    ]);
    if (job.status_message_id) {
      await telegram
        .editMessageText(chatId, job.status_message_id, withLink, { reply_markup: failKb })
        .catch(async () => {
          await editStatus(chatId, job.status_message_id, withLink);
        });
    } else {
      await telegram.sendMessage(chatId, withLink, { reply_markup: failKb });
    }
    return { id: job.id, status: "failed" };
  }
}

import { workersForLoad } from "../bot/queue-priority";

export function maxConcurrentJobs(): number {
  const raw = process.env.MAX_CONCURRENT_JOBS;
  if (raw == null || String(raw).trim() === "") return 3;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(8, Math.trunc(n)) : 3;
}

export async function drainJobs(max?: number) {
  const cap = maxConcurrentJobs();
  let pending = 1;
  try {
    const { jobStats } = await import("./queue.server");
    pending = (await jobStats()).pending;
  } catch {
    pending = 3;
  }
  const auto = workersForLoad(pending, cap);
  const requested = max != null && Number.isFinite(max) && max > 0 ? Math.trunc(max) : auto;
  const limit = Math.max(1, Math.min(8, requested));
  return Promise.all(Array.from({ length: limit }, () => processDownloadJob()));
}
