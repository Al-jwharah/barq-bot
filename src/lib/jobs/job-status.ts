export const JOB_STATUSES = [
  "pending",
  "processing",
  "uploading",
  "completed",
  "failed",
  "cancelled",
  "expired",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const ACTIVE_JOB_STATUSES: JobStatus[] = ["pending", "processing", "uploading"];

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["uploading", "failed", "cancelled"],
  uploading: ["completed", "failed", "cancelled"],
  completed: ["expired"],
  failed: ["pending"],
  cancelled: [],
  expired: [],
};

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`illegal job transition: ${from} -> ${to}`);
  }
}

/** Default 15 minutes. Outer bound for yt-dlp/ffmpeg; stuck reclaim uses the same window. */
export function jobTimeoutMs(): number {
  const n = Number(process.env.DOWNLOAD_TIMEOUT_MS ?? 900000);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 900000;
}

/** Job owner or bot owner may cancel an in-flight job. Nobody else. */
export function canActorCancel(
  jobTgId: string | number,
  actorTgId: string | number,
  isBotOwner: boolean,
  status: JobStatus,
): boolean {
  if (!ACTIVE_JOB_STATUSES.includes(status)) return false;
  return String(jobTgId) === String(actorTgId) || isBotOwner;
}

export function errorMessageSafe(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b\d{8,12}:AA[A-Za-z0-9_-]{10,}\b/g, "[token]")
    .replace(/xai-[A-Za-z0-9]+/gi, "[key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function errorCodeOf(raw: string, fallback = "download_failed"): string {
  const s = raw.toLowerCase();
  if (/blocked|nsfw|adult|porn/.test(s)) return "blocked";
  if (/private|login required|members only/.test(s)) return "private";
  if (/unsupported|غير مدعوم|منصة غير/.test(s)) return "unsupported";
  if (/invalid url|malformed|not a valid/.test(s)) return "invalid_url";
  if (/too large|file size|50\s*mb|payload too large/.test(s)) return "too_large";
  if (/expired link|link has expired|link expired|this link (has )?expired/.test(s)) return "expired_link";
  if (/timeout|timed out|etimedout|aborted|download_timeout/.test(s)) return "timeout";
  if (/502|503|504|\b500\b|internal server/.test(s)) return "telegram_5xx";
  if (/storage|blob/.test(s)) return "storage";
  if (/provider temp|temporarily unavailable/.test(s)) return "provider_temp";
  if (/econnreset|enotfound|eai_again|network|socket hang|fetch failed/.test(s)) return "network";
  if (/stuck/.test(s)) return "stuck";
  if (/cancel/.test(s)) return "cancelled";
  if (/403|forbidden/.test(s)) return "forbidden";
  if (/404|not found/.test(s)) return "not_found";
  return fallback;
}

export function stampColumn(to: JobStatus): "started_at" | "completed_at" | "failed_at" | "cancelled_at" | "expired_at" | null {
  if (to === "processing") return "started_at";
  if (to === "completed") return "completed_at";
  if (to === "failed") return "failed_at";
  if (to === "cancelled") return "cancelled_at";
  if (to === "expired") return "expired_at";
  return null;
}
