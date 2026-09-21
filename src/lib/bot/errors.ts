export const ERROR_MESSAGES = {
  INVALID_URL: "الرابط غير صحيح. أرسل رابطًا كاملًا يبدأ بـ https://",
  PRIVATE_CONTENT: "لا يمكن تحميل هذا المحتوى لأنه خاص أو يتطلب تسجيل دخول.",
  UNSUPPORTED_PLATFORM: "هذه المنصة غير مدعومة حاليًا.",
  FILE_TOO_LARGE: "حجم الملف أكبر من الحد المسموح به.",
  DOWNLOAD_TIMEOUT: "استغرق التحميل وقتًا طويلًا. حاول بجودة أقل أو أعد المحاولة لاحقًا.",
  SOURCE_UNAVAILABLE: "المصدر غير متاح حاليًا.",
  RATE_LIMITED: "وصلت إلى الحد المؤقت. حاول بعد قليل.",
  SYSTEM_BUSY: "الخدمة مشغولة حاليًا، وتم وضع طلبك في الانتظار.",
  JOB_CANCELLED: "تم إلغاء التحميل.",
  UNKNOWN_ERROR: "حدث خطأ مؤقت. حاول مرة أخرى أو تواصل مع الدعم.",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export const ERROR_CODES = Object.keys(ERROR_MESSAGES) as ErrorCode[];

const LEAK_RE =
  /econn(?:reset|refused)?|etimedout|enotfound|eai_again|yt-?dlp|stack|postgres|sql(?:ite)?\b|relation ["']|\/workspace|\/src\/|\/home\/|node_modules|api[_-]?key|secret|bearer\s|xai-|sk-[a-z0-9]|password|database_url|at \S+\.(?:ts|js):\d+|traceback|pg_|\.sql\b/i;

export function leaksTechnical(text: string): boolean {
  return LEAK_RE.test(text);
}

export function errorCodeFromMessage(raw: string): ErrorCode {
  const s = (raw || "").toLowerCase();
  if (/invalid url|malformed|not a valid|رابط غير/.test(s)) return "INVALID_URL";
  if (/private|login required|members only|خاص/.test(s)) return "PRIVATE_CONTENT";
  if (/unsupported|غير مدعوم|منصة غير/.test(s)) return "UNSUPPORTED_PLATFORM";
  if (/too large|file size|50\s*mb|500\s*mb|payload too large|أكبر من|حجم الملف|file_too_large/.test(s)) return "FILE_TOO_LARGE";
  if (/timeout|timed out|etimedout|download_timeout/.test(s)) return "DOWNLOAD_TIMEOUT";
  if (/cancel/.test(s)) return "JOB_CANCELLED";
  if (/busy|queue full|system_busy/.test(s)) return "SYSTEM_BUSY";
  if (/429|rate limit|too many/.test(s)) return "RATE_LIMITED";
  if (/unavailable|502|503|504|network|econn|source_unavailable/.test(s)) return "SOURCE_UNAVAILABLE";
  return "UNKNOWN_ERROR";
}

export function rateLimitedMessage(retryAfter: number): string {
  const sec = Math.max(1, Math.ceil(retryAfter));
  return `وصلت إلى الحد المؤقت. حاول بعد ${sec} ثانية.`;
}

export function userError(raw: string, retryAfter?: number): string {
  const code = errorCodeFromMessage(raw);
  const msg =
    code === "RATE_LIMITED" && retryAfter && retryAfter > 0
      ? rateLimitedMessage(retryAfter)
      : ERROR_MESSAGES[code];
  if (leaksTechnical(msg)) return ERROR_MESSAGES.UNKNOWN_ERROR;
  return msg;
}

export function publicError(err: unknown, retryAfter?: number): string {
  const raw = err instanceof Error ? err.message.split("\n")[0]! : String(err ?? "");
  return userError(raw, retryAfter);
}
