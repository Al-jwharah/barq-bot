/**
 * User-facing «برق AI» copy — never Grok/xAI/جروك in UI strings.
 * Silent router aliases stay elsewhere for compat.
 */

export const BARQ_AI_BRAND = "برق AI";

/** Feature flag off (BARQ_AI_ENABLED=false). */
export const AI_DISABLED_AR = `«${BARQ_AI_BRAND}» متوقف مؤقتًا من الإعدادات. التحميل يبقى متاحًا — الصق الرابط.`;

/**
 * Missing XAI_API_KEY — fail LOUDLY. Never soft «يتهيأ» that sounds like success.
 */
export const AI_MISSING_KEY_AR =
  `«${BARQ_AI_BRAND}» غير مفعّل الآن: مفتاح الخدمة غير مضبوط على الخادم.\n` +
  `أخبر المطوّر بضبط المفتاح ثم أعد المحاولة.\n` +
  `التحميل يبقى يعمل — الصق الرابط في أي وقت.`;

export const AI_BUSY_AR = `«${BARQ_AI_BRAND}» مشغول لحظة. حاول بعد قليل.\nالصق الرابط للتحميل مباشرة.`;

export const AI_GENERIC_ERROR_AR = `حدث خطأ مؤقت في «${BARQ_AI_BRAND}». حاول لاحقًا.`;

export const AI_NO_CLIP_AR = "ما عندي المقطع بعد. حمّله أولًا ثم اضغط الزر من جديد.";

/** True when reply is a known AI failure (limits, missing key, disabled). */
export function isLoudAiFailure(text: string): boolean {
  const t = String(text || "");
  return (
    t.includes("مفتاح الخدمة غير مضبوط") ||
    t.includes("متوقف مؤقتًا") ||
    t.includes("مشغول لحظة") ||
    t === AI_GENERIC_ERROR_AR ||
    t.includes("حدث خطأ مؤقت")
  );
}

export function aiReadyGate(opts: { enabled: boolean; hasKey: boolean }): string | null {
  if (!opts.enabled) return AI_DISABLED_AR;
  if (!opts.hasKey) return AI_MISSING_KEY_AR;
  return null;
}
