export const MAX_JOB_ATTEMPTS = 3;
export const RETRY_DELAYS_MS = [5_000, 30_000, 120_000] as const;

const TERMINAL =
  /invalid url|malformed|not a valid url|unsupported|غير مدعوم|private video|this video is private|login required|members only|video is unavailable|blocked|nsfw|adult|too large|payload too large|file size|50\s*mb|أكبر من حد|منصة غير|غير مسموح|ssrf|expired link|link has expired|link expired|this link (has )?expired|expired token|no longer available/;
const RETRYABLE =
  /timeout|timed out|etimedout|econnreset|econnrefused|enotfound|eai_again|network|socket hang|fetch failed|aborted|502|503|504|\b500\b|internal server|storage|blob|temporarily|rate limit|429|stuck|provider temp|temporarily unavailable|try again later|service unavailable|download_failed_kill|download_timeout/;

export function retryDelayMs(attemptsDone: number): number {
  const i = Math.min(Math.max(attemptsDone, 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[i]!;
}

export function isTerminalError(raw: string): boolean {
  return TERMINAL.test(raw.toLowerCase());
}

export function isRetryableError(raw: string): boolean {
  const s = raw.toLowerCase();
  if (isTerminalError(s)) return false;
  return RETRYABLE.test(s);
}

export function shouldRetry(raw: string, attemptsDone: number, maxAttempts = MAX_JOB_ATTEMPTS): boolean {
  return attemptsDone < maxAttempts && isRetryableError(raw);
}

export function userRetryMessage(_attemptsDone?: number, _maxAttempts?: number): string {
  return "📥 جاري التحميل…";
}

export function userFailMessage(raw: string): string {
  const first = raw.split("\n")[0]!.trim();
  const s = first.toLowerCase();
  if (/^عذرًا|^هذا |^الفيديو|^تعذر |^الرابط|^المنصة|^يُمنع|^أرسل|^ما قدرت/.test(first) && first.length < 400) {
    return first;
  }
  if (/private|login required|members only/.test(s)) return "هذا الفيديو خاص ولا يمكن تحميله.";
  if (/live stream|livestream|is live|البث/.test(s)) return "هذا بث مباشر. أرسل المقطع بعد انتهائه، أو كليب جاهز.";
  if (/copyright|content id|blocked in your country/.test(s)) {
    return "قد يكون المقطع محمياً بحقوق. جرّب رابطًا عامًا من صاحب الحساب.";
  }
  if (/unavailable|has been removed|deleted|not exist|account terminated/.test(s)) {
    return "الفيديو محذوف أو غير متاح.";
  }
  if (/unsupported|غير مدعوم|منصة غير/.test(s)) return "هذا الموقع غير مدعوم حاليًا.";
  if (/invalid url|malformed|not a valid/.test(s)) return "الرابط غير صالح. أرسل رابط فيديو مباشر.";
  if (/expired link|link has expired|link expired|this link (has )?expired/.test(s)) {
    return "انتهت صلاحية الرابط. أرسل رابطًا جديدًا.";
  }
  if (/too large|payload too large|file size|50\s*mb|أكبر من حد|حجم الملف|oversize_host/.test(s)) {
    return "المقطع أكبر من حد تليجرام. أعد إرسال الرابط بعد التحديث.";
  }
  if (/blocked|nsfw|adult/.test(s)) return "تعذر تحميل هذا المحتوى.";
  if (/timeout|timed out|etimedout|download_timeout|aborted/.test(s)) return "انتهت مهلة المصدر. حاول لاحقًا.";
  if (/download_failed_spawn|spawn/.test(s)) return "تعذر إرسال الملف. أعد إرسال الرابط.";
  if (/(?:^|\s)429\b|rate limit/.test(s) && !/redirect/.test(s)) {
    return "تعذر التحميل من المصدر. أعد إرسال الرابط.";
  }
  if (/403|401|unauthorized|forbidden/.test(s)) return "تعذر الوصول للمصدر. جرّب رابطًا آخر.";
  return "تعذر تجهيز المقطع. جرّب رابطًا آخر أو أعد المحاولة لاحقًا.";
}
