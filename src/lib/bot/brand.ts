import { BOT_USERNAME, SIGNATURE } from "./config.server";

export const RELIGIOUS_DISCLAIMER = "إن الله يراك. فاتقوا الله فيما تشاهدون.";

export function platformLabelAr(platform?: string | null): string {
  switch ((platform || "").toLowerCase()) {
    case "facebook":
      return "فيسبوك";
    case "instagram":
      return "إنستغرام";
    case "tiktok":
      return "تيك توك";
    case "youtube":
      return "يوتيوب";
    case "x":
    case "twitter":
      return "إكس";
    case "threads":
      return "ثريدز";
    case "reddit":
      return "ردّيت";
    case "pinterest":
      return "بنترست";
    case "twitch":
      return "تويتش";
    case "vimeo":
      return "فيميو";
    case "direct":
      return "ملف مباشر";
    case "generic":
      return "رابط";
    default:
      return platform ? platform : "رابط";
  }
}

export const FUN_SIGNATURES = [
  "⚡ تم التحميل بنجاح\nبس باقي عليك تطلب كنتاكي 😂🍗",
  "برق ⚡️\nخدمتك كاملة… باقي نجيب لك كنتاكي 🍗🤣",
  "نزلنا لك الفيديو ⚡️\nلا تزيد الطلبات علينا… ما تبي كنتاكي بعد؟ 😂",
  "برق ⚡️ تحميل سريع بدون تعقيد\nوالكنتاكي خارج الخدمة 😂🍗",
  "برق ⚡️\nما تبي كنتاكي بعد؟ 🍗",
  "وصل الفيديو قبل الدليفري ⚡️\nالكنتاكي يتأخر، برق لا 😂",
  "برق_يغنيك ⚡️\nحمّلنا المقطع… الدجاج عليك 🍗",
  "تم ⚡️\nلو كان فيه عرض كنتاكي مع التحميل كنا حطيناه 😂",
  "برق ⚡️ جاهز\nالفيديو عندك، الباقي فروج 🐓",
  "سكّبناها لك ⚡️\nبدون طابور وبدون كنتاكي إجباري 😂🍗",
  "برق ⚡️\nأسرع من الطلب، وأظرف من الجوع 🤣",
  "تم التسليم ⚡️\nلو تبي الدجاج، التوصيل الثاني عليك 🍗😂",
];

export function clipCaption(
  username?: string | null,
  _kind: "video" | "photo" | "audio" = "video",
  _platform?: string | null,
  _sourceUrl?: string | null,
  seed?: number,
): string {
  const handle = (username || BOT_USERNAME).replace(/^@/, "").trim() || BOT_USERNAME;
  const n = FUN_SIGNATURES.length;
  const i =
    seed != null && Number.isFinite(seed)
      ? ((Math.trunc(seed) % n) + n) % n
      : Math.floor(Math.random() * n);
  return `${FUN_SIGNATURES[i]}\n\n@${handle}`;
}

export const TRY_BOT_LABEL = "جرب البوت الآن ⚡️";

export function botDeepLink(username?: string | null, start = "try"): string {
  const handle = (username || BOT_USERNAME).replace(/^@/, "").trim() || BOT_USERNAME;
  return `https://t.me/${handle}?start=${encodeURIComponent(start)}`;
}

export function normalizeChannel(raw?: string | null): string {
  if (!raw) return "";
  let s = raw.trim();
  s = s.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "");
  s = s.replace(/^@/, "");
  s = s.replace(/\/.*$/, "").trim();
  if (!s || s === "*****") return "";
  if (/^-\d{5,20}$/.test(s)) return s;
  if (/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(s)) return s;
  return "";
}

export function channelUrl(username: string): string {
  const handle = username.replace(/^@/, "");
  if (handle.startsWith("-")) return `https://t.me/c/${handle.replace(/^-100/, "").replace(/^-/, "")}`;
  return `https://t.me/${handle}`;
}

export { SIGNATURE };
