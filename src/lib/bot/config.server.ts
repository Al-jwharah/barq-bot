const TRUE_FLAG = new Set(["1", "true", "on", "yes"]);
const FALSE_FLAG = new Set(["0", "false", "off", "no"]);

/** Boolean env keys evaluated at startup — invalid values must throw. */
export const KNOWN_BOOLEAN_FLAGS = [
  "BARQ_TEMP_FREE",
  "BARQ_SUBSCRIPTIONS_LIVE",
  "BARQ_DAILY_CAP_ON",
  "BARQ_MAINTENANCE",
  "BARQ_VAULT_ARCHIVE_ENABLED",
  "BARQ_AI_ENABLED",
  "BARQ_COFFEE_ENABLED",
  "BARQ_WATERMARK_ENABLED",
  "BARQ_LAUNCH_MODE",
  "USE_LOCAL_TELEGRAM_API",
  "CLEANUP_ENABLED",
  "BARQ_REQUIRE_POSTGRES",
] as const;

const KNOWN_BOOLEAN_FLAG_SET = new Set<string>(KNOWN_BOOLEAN_FLAGS);

function env(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const v = process.env[name]?.trim();
  return v || undefined;
}

export function envFlag(name: string, fallback: boolean): boolean {
  const raw = env(name);
  if (raw == null) return fallback;
  const v = raw.toLowerCase();
  if (TRUE_FLAG.has(v)) return true;
  if (FALSE_FLAG.has(v)) return false;
  if (KNOWN_BOOLEAN_FLAG_SET.has(name)) {
    throw new Error(
      `Invalid boolean flag ${name}=${raw}. Use true/false/on/off/1/0/yes/no.`,
    );
  }
  return fallback;
}

export const TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN") ?? "";
export const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

export const BOT_USERNAME = env("BARQ_BOT_USERNAME") ?? "barq_ibot";
export const BOT_DISPLAY_NAME = "برق ⚡️ لتحميل الفيديوهات";
export const BOT_BRAND = "برق";
export const BOT_DESCRIPTION =
  "برق ⚡️ الصق الرابط ويصلك المقطع.\nالكبير يتحمّل من الموقع مباشرة.\nتحت كل ملف: لخّصه وكابشن بالذكاء.\n\nabdulrhman.ai\nالدعم @i_2169";
export const BOT_SHORT = "برق ⚡️ الصق الرابط. الكبير من الموقع.";

export const TELEGRAM_MAX_UPLOAD = 49 * 1024 * 1024;
export const TELEGRAM_MAX_URL = 19 * 1024 * 1024;

/** scrypt hex (64 chars). Production must set this — not a plaintext PIN. */
export const ADMIN_PIN_HASH = env("BARQ_ADMIN_PIN_HASH") ?? "";
/** Local-dev fallback only. Never log. Production must use BARQ_ADMIN_PIN_HASH. */
export const ADMIN_PIN = env("BARQ_ADMIN_PIN") ?? "";
export const OWNER_TG_ID = env("BARQ_OWNER_TG_ID") ?? "8471762251";
export const OWNER_IDS = (env("BARQ_OWNER_IDS") ?? "8471762251,5554780316")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const TEMP_FREE = envFlag("BARQ_TEMP_FREE", true);
/** Charging the public. Keep false until the owner says launch. */
export const SUBSCRIPTIONS_LIVE = envFlag("BARQ_SUBSCRIPTIONS_LIVE", false);
export const DAILY_CAP = Number(env("BARQ_DAILY_CAP") ?? 5) || 5;
export const DAILY_CAP_ON = envFlag("BARQ_DAILY_CAP_ON", true);
export const MAINTENANCE = envFlag("BARQ_MAINTENANCE", false);
export const LAUNCH_MAX = Number(env("BARQ_LAUNCH_MAX") ?? 100) || 100;
export const MAINTENANCE_TEXT = `نعتذر عن البداية السيئة ⚡️

البوت تحت التطوير، وسيعود للعمل بشكل جديد قريبًا.`;
export const BARQ_AI_DAILY = Number(env("BARQ_AI_DAILY") ?? 10) || 10;
export const FREE_DOWNLOADS = Number(env("BARQ_FREE_DOWNLOADS") ?? 5) || 5;
export const MONTHLY_CAP = Number(env("BARQ_MONTHLY_CAP") ?? 30) || 30;
export const MONTHLY_CAP_ON = envFlag("BARQ_MONTHLY_CAP_ON", true);
export const SUB_STARS = 50;
export const SUB_SAR = "4.99";
export const SUB_DAYS = 30;
export const SUB_PERIOD_SEC = 2592000;
export const PRO_STARS = 50;
export const VIP_STARS = 200;
export const MAX_STARS = 200;
export const MAX_SAR = "19.99";
export const JOB_MAX_ATTEMPTS = 3;
export const RATE_PER_MINUTE = 8;
export const RATE_LINKS_PER_HOUR = 20;

export const VAULT_ARCHIVE_ENABLED = envFlag("BARQ_VAULT_ARCHIVE_ENABLED", true);
export const AI_ENABLED = envFlag("BARQ_AI_ENABLED", true);
export const COFFEE_ENABLED = envFlag("BARQ_COFFEE_ENABLED", true);
export const WATERMARK_ENABLED = envFlag("BARQ_WATERMARK_ENABLED", false);
export const LAUNCH_MODE = envFlag("BARQ_LAUNCH_MODE", true);
export const DOWNLOAD_TIMEOUT_MS = Number(env("DOWNLOAD_TIMEOUT_MS") ?? 900000) || 900000;
export const MAX_CONCURRENT_JOBS = Number(env("MAX_CONCURRENT_JOBS") ?? 3) || 3;
export const MAX_DOWNLOAD_SIZE_MB = Number(env("MAX_DOWNLOAD_SIZE_MB") ?? 500) || 500;
export const FILE_RETENTION_DAYS = Number(env("FILE_RETENTION_DAYS") ?? 7) || 7;
export const TEMP_FILE_RETENTION_HOURS = Number(env("TEMP_FILE_RETENTION_HOURS") ?? 6) || 6;
export const LOG_RETENTION_DAYS = Number(env("LOG_RETENTION_DAYS") ?? 30) || 30;
export const AI_MAX_MESSAGE_LENGTH = Number(env("AI_MAX_MESSAGE_LENGTH") ?? 2000) || 2000;
export const AI_MAX_OUTPUT_TOKENS = Number(env("AI_MAX_OUTPUT_TOKENS") ?? 700) || 700;
export const AI_TIMEOUT_MS = Number(env("AI_TIMEOUT_MS") ?? 30000) || 30000;
export const ADMIN_MAX_LOGIN_ATTEMPTS = Number(env("ADMIN_MAX_LOGIN_ATTEMPTS") ?? 5) || 5;
export const ADMIN_LOCK_MINUTES = Number(env("ADMIN_LOCK_MINUTES") ?? 15) || 15;
export const BARQ_TIMEZONE = env("BARQ_TIMEZONE") ?? "Asia/Riyadh";
export const TELEGRAM_CLOUD_MAX_MB = Number(env("TELEGRAM_CLOUD_MAX_MB") ?? 50) || 50;
export const USE_LOCAL_TELEGRAM_API = envFlag("USE_LOCAL_TELEGRAM_API", false);
export const CLEANUP_ENABLED = envFlag("CLEANUP_ENABLED", true);
export const BARQ_VAULT_RETENTION_DAYS = Number(env("BARQ_VAULT_RETENTION_DAYS") ?? 7) || 7;
export const BARQ_REQUIRE_POSTGRES = envFlag("BARQ_REQUIRE_POSTGRES", false);
export const LOG_LEVEL = env("LOG_LEVEL") ?? "info";

export const SIGNATURE = "برق ⚡️";
export const DISCOUNT_CODE = "BARQ30";
export const DISCOUNT_DAYS = 30;
export const DISCOUNT_USES = 1000;

export const CHANNEL_USERNAME = "barq_all";
export const CHANNEL_TITLE = "برق ⚡️ | التحديثات";
export const CHANNEL_DESCRIPTION =
  "تحديثات وأخبار ومسابقات برق. البوت @barq_ibot — ٥ تجارب مجانية بعد الانضمام. الدعم @i_2169";
export const CHANNEL_CHAT = `@${CHANNEL_USERNAME}`;
export const VAULT_INVITE = env("BARQ_VAULT_INVITE") ?? "https://t.me/+5X9lbwSU6fgzMDFk";
export const VAULT_CHAT_ID = env("BARQ_VAULT_CHAT_ID") ?? "-1003973499061";

export const SUPPORT_USERNAME = "i_2169";
export const SUPPORT_URL = `https://t.me/${SUPPORT_USERNAME}`;
export const SUPPORT_EMAIL = "info@aljwharah.ai";
export const TON_USDT_ADDRESS = "UQAsguO6LSHNNO-D_Ne8Xj6ahiu7MmVAqEELyOJzh2j_0CzE";
export const TON_WALLET_URL = "https://t.me/wallet?profile";
export const COFFEE_STARS = [10, 25, 50, 100, 250] as const;
export const COFFEE_TIP_STARS = 50;
export const COFFEE_TITLE = "كوب قهوة للمطور";

export const GROK_MODELS = ["grok-4.5", "grok-4", "grok-3"] as const;
export type GrokModel = (typeof GROK_MODELS)[number];
export const GROK_SPEEDS = ["fast", "balanced", "thorough"] as const;
export type GrokSpeed = (typeof GROK_SPEEDS)[number];

export const GROK_MODEL_META: Record<GrokModel, { label: string; hint: string }> = {
  "grok-4.5": { label: "Grok 4.5", hint: "الأحدث والأقوى" },
  "grok-4": { label: "Grok 4", hint: "متوازن" },
  "grok-3": { label: "Grok 3", hint: "خفيف وسريع" },
};

export function grokModelLabel(model: string): string {
  if (model in GROK_MODEL_META) return GROK_MODEL_META[model as GrokModel].label;
  return model;
}

export function isOwnerId(id: number | string | null | undefined): boolean {
  if (id == null) return false;
  const value = String(id).trim();
  return value === OWNER_TG_ID || OWNER_IDS.includes(value);
}

export function grokApiKey(): string | undefined {
  return env("XAI_API_KEY");
}

export function jobSecret(): string {
  return env("BARQ_JOB_SECRET") || ADMIN_PIN || TELEGRAM_BOT_TOKEN.slice(-12) || "barq-jobs";
}

export function webhookSecret(): string {
  return env("TELEGRAM_WEBHOOK_SECRET") ?? "";
}

export function adminPinConfigured(): boolean {
  return Boolean(ADMIN_PIN_HASH || ADMIN_PIN);
}

export function secretsReady(): { telegram: boolean; grok: boolean; adminPin: boolean; webhookSecret: boolean } {
  return {
    telegram: Boolean(TELEGRAM_BOT_TOKEN),
    grok: Boolean(grokApiKey()),
    adminPin: adminPinConfigured(),
    webhookSecret: Boolean(webhookSecret()),
  };
}

export function isGrokModel(v: string): v is GrokModel {
  return (GROK_MODELS as readonly string[]).includes(v);
}

export function isGrokSpeed(v: string): v is GrokSpeed {
  return (GROK_SPEEDS as readonly string[]).includes(v);
}
