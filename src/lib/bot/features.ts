/**
 * Owner-controlled feature flags (owner panel → «الميزات»).
 * Stored in bot_settings as ff_<name> = "on" | "off"; unset falls back to the
 * default below (env-driven where an env flag already existed), so current UX is unchanged.
 */
export type FeatureName = "quality" | "audio" | "trim" | "post_ai" | "batch" | "inline" | "owner_report";

export type FeatureSpec = { key: string; label: string; hint: string; fallback: (env: Record<string, string | undefined>) => boolean };

function envOn(env: Record<string, string | undefined>, name: string, fallback: boolean): boolean {
  const v = (env[name] ?? "").trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(v)) return true;
  if (["0", "false", "off", "no"].includes(v)) return false;
  return fallback;
}

export const FEATURES: Record<FeatureName, FeatureSpec> = {
  quality: {
    key: "ff_quality",
    label: "اختيار الجودة",
    hint: "قبل الإرسال يختار المستخدم 360/480/720/1080 أو صوت فقط.",
    fallback: (env) => envOn(env, "BARQ_QUALITY_PICKER", false),
  },
  audio: {
    key: "ff_audio",
    label: "استخراج الصوت (MP3/فويس)",
    hint: "بعد الفيديو: زر «صوت فقط» و«رسالة صوتية». فلتر الموسيقى يبقى فعّالًا.",
    fallback: () => false,
  },
  trim: {
    key: "ff_trim",
    label: "القص من المحادثة",
    hint: "بعد التحميل يكتب المستخدم: من 1:20 إلى 2:05 (حتى 3 دقائق).",
    fallback: () => false,
  },
  post_ai: {
    key: "ff_post_ai",
    label: "ملخص/كابشن Grok",
    hint: "بعد كل ملف: أزرار لخّصه · كابشن · ترجمة.",
    fallback: (env) => envOn(env, "BARQ_POST_DELIVERY_AI", false),
  },
  batch: {
    key: "ff_batch",
    label: "روابط متعددة",
    hint: "عدة روابط في رسالة واحدة (3 للمجاني، 5 للمشترك).",
    fallback: () => true,
  },
  inline: {
    key: "ff_inline",
    label: "الوضع المضمّن @",
    hint: "كتابة @البوت + رابط في أي محادثة. يحتاج تفعيل Inline من BotFather.",
    fallback: () => false,
  },
  owner_report: {
    key: "ff_owner_report",
    label: "تقرير يومي للمالك",
    hint: "رسالة يومية 7 صباحًا للمالك فقط بالأرقام.",
    fallback: () => true,
  },
};

export const FEATURE_ORDER: FeatureName[] = ["quality", "audio", "trim", "post_ai", "batch", "inline", "owner_report"];

export function isFeatureName(v: string): v is FeatureName {
  return (FEATURE_ORDER as string[]).includes(v);
}

export function resolveFeature(
  name: FeatureName,
  settings: Record<string, string | undefined>,
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): boolean {
  const raw = settings[FEATURES[name].key];
  if (raw === "on") return true;
  if (raw === "off") return false;
  return FEATURES[name].fallback(env);
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** "من 1:20 إلى 2:05" / "1:20 الى 2:05" / "1:20-2:05" (Arabic digits ok) → "1:20-2:05", else null. */
export function normalizeTrimText(text: string): string | null {
  const t = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[：٫]/g, ":");
  const m = t.match(/^(?:قص\s*)?(?:من\s*)?(\d{1,2}(?::\d{2}){0,2})\s*(?:إلى|الى|إلي|الي|لين|لـ|-|–|—|to)\s*(\d{1,2}(?::\d{2}){0,2})$/i);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}
