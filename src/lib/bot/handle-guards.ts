import { isAppealCommand } from "./bans";

export const JOB_CANCEL_PREFIX = "job:cancel:";
export const JOB_RETRY_PREFIX = "job:retry:";

export function parsePrefixedId(data: string, prefix: string): string | null {
  if (!data.startsWith(prefix)) return null;
  const id = data.slice(prefix.length).trim();
  return id.length > 0 ? id : null;
}

export function parseJobCancelId(data: string): string | null {
  return parsePrefixedId(data, JOB_CANCEL_PREFIX);
}

export function parseJobRetryId(data: string): string | null {
  return parsePrefixedId(data, JOB_RETRY_PREFIX);
}

/** Banned users may cancel an in-flight job; retry/new jobs stay blocked. */
export function bannedCallbackPermitted(data: string): boolean {
  return data.startsWith(JOB_CANCEL_PREFIX);
}

export function bannedMessageAction(text: string): "appeal" | "start" | "block" {
  const t = text.trim();
  if (isAppealCommand(t)) return "appeal";
  if (t.startsWith("/start")) return "start";
  return "block";
}

export function blocksBannedJob(isBanned: boolean, isOwner: boolean): boolean {
  return Boolean(isBanned) && !isOwner;
}

const HOSTFILE_EXIT = new Set([
  "القائمة",
  "بدء",
  "برق AI",
  "سجلي",
  "مكتبتي",
  "حدّي",
  "حدي",
  "رحلتي",
  "رحلتك",
  "إنجازاتي",
  "أعجبني",
  "كيف يعمل",
  "حسابي",
  "نقاطي",
  "دعوة",
  "كوبون",
  "رابط مؤقت",
]);

export function hostfileYieldsToDownload(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^(?:www\.)?(?:x\.com|twitter\.com|tiktok\.com|instagram\.com|youtube\.com|youtu\.be)\//i.test(t)) return true;
  if (t.startsWith("/")) return true;
  return HOSTFILE_EXIT.has(t);
}

export type HostfileDecision = "upload" | "download" | "wait" | "ignore";

/** Hostfile wait never owns a video URL or a command. */
export function decideHostfile(input: { text: string; hasUrl: boolean; hasFile: boolean }): HostfileDecision {
  if (input.hasFile) return "upload";
  if (input.hasUrl || hostfileYieldsToDownload(input.text)) return "download";
  if (input.text.trim()) return "wait";
  return "ignore";
}

/** Side effects (news publish, rating card) must never throw into the download path. */
export async function swallowSideEffect<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** Cap concurrent URLs from one Telegram message (never silent-drop extras). */
export const MULTI_LINK_CAP = 3;

export function selectDownloadUrls(
  urls: string[],
  cap = MULTI_LINK_CAP,
): { batch: string[]; total: number; truncated: boolean } {
  const unique: string[] = [];
  for (const u of urls) {
    const t = String(u ?? "").trim();
    if (!t || unique.includes(t)) continue;
    unique.push(t);
  }
  const limit = Number.isFinite(cap) && cap > 0 ? Math.trunc(cap) : MULTI_LINK_CAP;
  return {
    batch: unique.slice(0, limit),
    total: unique.length,
    truncated: unique.length > limit,
  };
}

/** Arabic status when the user pasted more than one link. */
export function multiLinkStatusText(total: number, cap = MULTI_LINK_CAP): string | null {
  if (total <= 1) return null;
  const limit = Number.isFinite(cap) && cap > 0 ? Math.trunc(cap) : MULTI_LINK_CAP;
  const skipped = total > limit ? `\nأخذت أول ${limit} فقط.` : "";
  const card = batchDots(0, 0, Math.min(total, limit));
  return `لقيت ${total} روابط — أحملها بالترتيب ⚡️\n${card} 0/${Math.min(total, limit)}${skipped}`;
}

/** 🟢 done · 🟡 active · ⚪ pending (kept local to avoid import cycles). */
export function batchDots(done: number, active: number, total: number): string {
  const n = Math.max(0, Math.trunc(total));
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    if (i < done) parts.push("🟢");
    else if (i === active) parts.push("🟡");
    else parts.push("⚪");
  }
  return parts.join("");
}
