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

export const CLIP_LINES = ["برق ⚡️"];

export function clipCaption(
  username?: string | null,
  _kind: "video" | "photo" | "audio" = "video",
  _platform?: string | null,
  _sourceUrl?: string | null,
  _seed?: number,
): string {
  const handle = (username || BOT_USERNAME).replace(/^@/, "").trim() || BOT_USERNAME;
  return `برق ⚡️
abdulrhman.ai
@${handle}`;
}

export function clipActionRows(
  accountUrl?: string,
  sourceUrl?: string,
): { text: string; url?: string; callback_data?: string }[][] {
  const site = sourceUrl
    ? `https://abdulrhman.ai/?url=${encodeURIComponent(sourceUrl)}`
    : "https://abdulrhman.ai";
  const rows: { text: string; url?: string; callback_data?: string }[][] = [
    [{ text: "لخّصه وكابشن", callback_data: "ai:pack" }],
    [{ text: "حمّله من الموقع", url: site }],
  ];
  if (accountUrl) rows.push([{ text: "حسابي", url: accountUrl }]);
  return rows;
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
