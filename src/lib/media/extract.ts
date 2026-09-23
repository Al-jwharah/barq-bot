import { extractFacebook } from "./platforms/facebook";
import { extractGeneric } from "./platforms/generic";
import { extractInstagram } from "./platforms/instagram";
import { extractPinterest } from "./platforms/pinterest";
import { extractReddit } from "./platforms/reddit";
import { extractTikTok } from "./platforms/tiktok";
import { extractTwitch } from "./platforms/twitch";
import { extractVimeo } from "./platforms/vimeo";
import { extractX } from "./platforms/x";
import { extractYouTube } from "./platforms/youtube";
import type { ExtractResult } from "./types";
import { detectPlatform, firstUrl, isDirectMediaUrl, supportedDownloadPlatform, canonicalYoutubeUrl, youtubeIdFromUrl, youtubePlaylistIdFromUrl } from "./urls";
import { fetchText } from "./http";
import { extractPlaylistLead, extractWithYtdlp, fitTelegramCloud, fileTooLargeError } from "./ytdlp";
import { assertPublicHttpUrl, assertSafeOutboundUrl, safeFetch, SsrfError } from "./ssrf";

function isShortener(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return /(^|\.)(t\.co|bit\.ly|cutt\.ly|tinyurl\.com|shorturl\.at|rb\.gy|is\.gd|ow\.ly|rebrand\.ly|s\.id|tiny\.cc|t\.ly|v\.gd|clck\.ru|lnkd\.in|soo\.gd|short\.io|pin\.it)$/i.test(
      host,
    );
  } catch {
    return false;
  }
}

function shouldFollow(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (isShortener(url)) return true;
    if (host === "vm.tiktok.com" || host.startsWith("vm.tiktok.") || host.startsWith("vt.tiktok.")) {
      return true;
    }
    if (host.includes("tiktok.com") && u.pathname.startsWith("/t/")) return true;
    if (host === "youtu.be" || host.endsWith(".youtu.be")) return true;
    if (host === "fb.watch" || host === "l.facebook.com" || host === "lm.facebook.com") return true;
    if (host === "pin.it" || host.endsWith(".pin.it")) return true;
    return false;
  } catch {
    return false;
  }
}

const SHORT_HINT =
  "هذا رابط مختصر محمي. أرسل رابط الفيديو نفسه (youtu.be أو youtube.com/watch) مو رابط الاشتراك.";

async function peekLocation(url: string): Promise<string | null> {
  try {
    await assertSafeOutboundUrl(url);
    const res = await safeFetch(url, { method: "GET", timeoutMs: 8000, maxRedirects: 0 });
    const loc = res.headers.get("location");
    if (loc) {
      const next = new URL(loc, url).toString();
      assertPublicHttpUrl(next);
      return next;
    }
  } catch (err) {
    if (err instanceof SsrfError && !/redirect/i.test(err.message)) throw err;
  }
  return null;
}

async function unwrap(url: string): Promise<string> {
  let current = url;
  const startedShort = isShortener(url);
  for (let i = 0; i < 5; i += 1) {
    assertPublicHttpUrl(current);
    if (!shouldFollow(current)) return current;
    const loc = await peekLocation(current);
    if (loc && loc !== current) {
      current = loc;
      continue;
    }
    try {
      const { finalUrl, status } = await fetchText(current, { method: "GET" }, 8000);
      if (finalUrl && finalUrl !== current) {
        current = finalUrl;
        continue;
      }
      if (startedShort && (status === 403 || status === 503 || status === 401)) {
        throw new Error(SHORT_HINT);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("رابط مختصر")) throw err;
      if (startedShort) throw new Error(SHORT_HINT);
      return current;
    }
    return current;
  }
  return current;
}

async function extractForPlatform(url: string, platform: string): Promise<ExtractResult> {
  switch (platform) {
    case "x":
      return extractX(url);
    case "tiktok":
      return extractTikTok(url);
    case "instagram":
      return extractInstagram(url);
    case "threads":
      try {
        return await extractInstagram(url);
      } catch {
        return extractGeneric(url);
      }
    case "youtube":
      return extractYouTube(url);
    case "reddit":
      return extractReddit(url);
    case "facebook":
      return extractFacebook(url);
    case "vimeo":
      return extractVimeo(url);
    case "pinterest":
      return extractPinterest(url);
    case "twitch":
      return extractTwitch(url);
    default:
      return extractGeneric(url);
  }
}

export async function extractMedia(input: string): Promise<ExtractResult> {
  const raw = firstUrl(input) ?? input.trim();
  await assertSafeOutboundUrl(raw);
  let url = await unwrap(raw);
  await assertSafeOutboundUrl(url);
  if (isShortener(url)) {
    throw new Error(SHORT_HINT);
  }
  if (detectPlatform(url) === "youtube") {
    if (youtubeIdFromUrl(url)) {
      url = canonicalYoutubeUrl(url);
    } else if (youtubePlaylistIdFromUrl(url)) {
      return extractPlaylistLead(url);
    } else {
      throw new Error("هذا رابط قناة أو اشتراك، مو رابط فيديو. أرسل رابط المقطع أو قائمة التشغيل.");
    }
  }
  supportedDownloadPlatform(url);

  if (isDirectMediaUrl(url)) {
    const lower = url.toLowerCase();
    const isAudio = /\.(mp3|m4a|aac|ogg|wav|flac)(\?|$)/i.test(lower);
    const isGif = /\.gif(\?|$)/i.test(lower);
    return {
      platform: "direct",
      sourceUrl: url,
      items: [
        {
          kind: isAudio ? "audio" : isGif ? "gif" : "video",
          url,
          variants: [
            {
              url,
              quality: "أصل",
              contentType: isAudio ? "audio/mpeg" : isGif ? "image/gif" : "video/mp4",
            },
          ],
        },
      ],
    };
  }

  const platform = detectPlatform(url);
  const errors: string[] = [];

  const tryOne = async (fn: () => Promise<ExtractResult>) => {
    const result = await fn();
    if (result.items.length) {
      try {
        return fitTelegramCloud(result);
      } catch (err) {
        if (isFileTooLarge(err)) return result;
        throw err;
      }
    }
    throw new Error("لا يوجد ملف");
  };

  const isFileTooLarge = (err: unknown) => {
    const m = err instanceof Error ? err.message : String(err ?? "");
    return /too large|file size|50\s*mb|أكبر من حد|file_too_large/i.test(m);
  };

  try {
    return await tryOne(() => extractForPlatform(url, platform));
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "فشل");
  }

  if (platform !== "generic") {
    try {
      return await extractWithYtdlp(url, platform);
    } catch (err) {
      if (isFileTooLarge(err)) errors.unshift(err instanceof Error ? err.message : "FILE_TOO_LARGE");
      else errors.push(err instanceof Error ? err.message : "yt-dlp");
    }
    if (platform !== "youtube") {
      try {
        return await tryOne(() => extractGeneric(url));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "generic");
      }
    }
  } else {
    try {
      return await extractWithYtdlp(url, "generic");
    } catch (err) {
      if (isFileTooLarge(err)) errors.unshift(err instanceof Error ? err.message : "FILE_TOO_LARGE");
      else errors.push(err instanceof Error ? err.message : "yt-dlp");
    }
    try {
      return await tryOne(() => extractGeneric(url));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "generic");
    }
  }

  try {
    const { grokFindDirectMedia } = await import("../bot/grok.server");
    const found = await grokFindDirectMedia(url);
    if (found?.items.length) {
      try {
        return fitTelegramCloud(found);
      } catch (err) {
        if (isFileTooLarge(err)) return found;
        throw err;
      }
    }
  } catch {
    /* grok is optional */
  }

  if (errors.some((e) => isFileTooLarge(e))) throw fileTooLargeError();
  throw new Error(errors[0] || "ما قدرت أحمّل هذا الرابط");
}
