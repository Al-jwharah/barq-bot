const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return found.map(cleanUrl).filter(Boolean);
}

export function cleanUrl(raw: string): string {
  return raw
    .replace(/[),.]+$/g, "")
    .split("&" + "amp;")
    .join("&")
    .trim();
}

export function firstUrl(text: string): string | undefined {
  return extractUrls(text)[0];
}

export type Platform =
  | "x"
  | "tiktok"
  | "instagram"
  | "youtube"
  | "reddit"
  | "threads"
  | "facebook"
  | "vimeo"
  | "pinterest"
  | "twitch"
  | "generic";

export const DOWNLOAD_PLATFORMS = ["tiktok", "instagram", "x", "youtube"] as const;

export function detectPlatform(url: string): Platform {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "generic";
  }
  if (
    /(^|\.)((twitter|x|fxtwitter|vxtwitter|fixupx|fixvx|girlcockx|twimg)\.com)$/.test(
      host,
    )
  ) {
    return "x";
  }
  if (/(^|\.)(tiktok\.com|musical\.ly)$/.test(host) || host.includes("tiktok")) {
    return "tiktok";
  }
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)threads\.(net|com)$/.test(host)) return "threads";
  if (
    host === "pin.it" ||
    host.endsWith(".pin.it") ||
    host.includes("pinterest.")
  ) {
    return "pinterest";
  }
  if (
    host === "twitch.tv" ||
    host.endsWith(".twitch.tv") ||
    host === "clips.twitch.tv" ||
    host.endsWith("twitch.tv")
  ) {
    return "twitch";
  }
  if (
    host === "fb.watch" ||
    host.endsWith(".fb.watch") ||
    host === "fb.com" ||
    host.endsWith(".fb.com") ||
    host.endsWith("facebook.com") ||
    host.endsWith("fbcdn.net")
  ) {
    return "facebook";
  }
  if (host.includes("vimeo.com")) return "vimeo";
  if (
    host === "youtu.be" ||
    host.endsWith("youtu.be") ||
    host.includes("youtube.com") ||
    host.endsWith("youtube-nocookie.com") ||
    host === "music.youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube.com"
  ) {
    return "youtube";
  }
  if (/(^|\.)((reddit|redd)\.it)$/.test(host) || host.endsWith("reddit.com")) {
    return "reddit";
  }
  return "generic";
}

export function tweetIdFromUrl(url: string): string | undefined {
  const match = url.match(/(?:status(?:es)?|i\/web\/status|i\/status|videos(?:\/tweet)?)\/(\d{5,})/i);
  if (match?.[1]) return match[1];
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (/(^|\.)((twitter|x|fxtwitter|vxtwitter|fixupx|fixvx|girlcockx)\.com)$/.test(host)) {
      const q = u.searchParams.get("id") || u.searchParams.get("tweet_id");
      if (q && /^\d{5,}$/.test(q)) return q;
      const digits = u.pathname.match(/(\d{15,20})/);
      if (digits?.[1]) return digits[1];
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function youtubeIdFromUrl(url: string): string | undefined {
  const m = url.match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/|e\/))([A-Za-z0-9_-]{6,})/i,
  );
  if (m?.[1]) return m[1];
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be" || u.hostname.endsWith(".youtu.be")) {
      return u.pathname.split("/").filter(Boolean)[0]?.replace(/[^A-Za-z0-9_-]/g, "");
    }
    const v = u.searchParams.get("v");
    if (v) return v.replace(/[^A-Za-z0-9_-]/g, "");
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") {
      return parts[1]?.replace(/[^A-Za-z0-9_-]/g, "");
    }
    if (parts[0] === "watch" && parts[1]) return parts[1];
  } catch {
    return undefined;
  }
  return undefined;
}

export function canonicalYoutubeUrl(url: string): string {
  const id = youtubeIdFromUrl(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url;
}

export function youtubePlaylistIdFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const list = u.searchParams.get("list");
    if (list && /^[\w-]{10,80}$/.test(list)) return list;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "playlist" && parts[1] && /^[\w-]{10,80}$/.test(parts[1])) return parts[1];
  } catch {
    return undefined;
  }
  return undefined;
}

export function instagramShortcode(url: string): string | undefined {
  const m = url.match(
    /instagram\.com\/(?:[\w.-]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i,
  );
  return m?.[2];
}

export function vimeoIdFromUrl(url: string): string | undefined {
  const m = url.match(
    /vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d{6,})/i,
  );
  return m?.[1];
}

export function qualityLabel(width?: number, height?: number): string {
  const d = Math.max(width ?? 0, height ?? 0);
  if (d >= 3840) return "4K";
  if (d >= 2560) return "1440p";
  if (d >= 1920) return "1080p";
  if (d >= 1280) return "720p";
  if (d >= 854) return "480p";
  if (d >= 640) return "360p";
  if (d > 0) return "240p";
  return "أصل";
}

export function parseResFromUrl(url: string): { width?: number; height?: number } {
  const m = url.match(/\/(\d{2,4})x(\d{2,4})\//);
  if (!m) return {};
  return { width: Number(m[1]), height: Number(m[2]) };
}

export function originalPhotoUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("twimg.com")) return url;
    u.searchParams.set("name", "orig");
    u.pathname = u.pathname.replace(/:(small|medium|large|thumb|orig)$/i, "");
    return u.toString();
  } catch {
    return url;
  }
}

export function isDirectMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = `${u.pathname}${u.search}`.toLowerCase();
    return /\.(mp4|webm|mkv|mov|m4v|avi|gif|mp3|m4a|aac|ogg|wav|flac)(\?|$)/i.test(path);
  } catch {
    return false;
  }
}

export function supportedDownloadPlatform(url: string): Platform | "direct" {
  if (isDirectMediaUrl(url)) return "direct";
  return detectPlatform(url);
}
