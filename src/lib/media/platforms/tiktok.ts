import { fetchJson } from "../http";
import { safeFetch } from "../ssrf";
import type { ExtractResult, MediaItem, MediaVariant } from "../types";

type Tikwm = {
  code?: number;
  msg?: string;
  data?: {
    id?: string;
    title?: string;
    cover?: string;
    origin_cover?: string;
    play?: string;
    hdplay?: string;
    wmplay?: string;
    duration?: number;
    author?: { nickname?: string; unique_id?: string };
    images?: string[];
  };
};

function variant(url: string, quality: string, size?: number): MediaVariant {
  return { url, quality, contentType: "video/mp4", size };
}

export function tiktokVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const fromPath =
      u.pathname.match(/\/(?:video|photo|v)\/(\d{8,30})/) ||
      u.pathname.match(/\/v\/(\d{8,30})/);
    if (fromPath?.[1]) return fromPath[1];
    const fromQuery = u.searchParams.get("aweme_id") || u.searchParams.get("item_id") || u.searchParams.get("id");
    if (fromQuery && /^\d{8,30}$/.test(fromQuery)) return fromQuery;
  } catch {
    /* ignore */
  }
  const loose = url.match(/\/(?:video|photo)\/(\d{8,30})/);
  return loose?.[1] ?? null;
}

export function isTikTokPhotoUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\/photo\//.test(path);
  } catch {
    return /\/photo\//i.test(url);
  }
}

export function isTikTokMusicCdn(url: string): boolean {
  return /ies-music|tiktokcdn[^/]*\/(?:music|audio)|\.mp3(?:\?|$)/i.test(url);
}

function isShortTikTok(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "vt.tiktok.com" || host === "vm.tiktok.com" || host === "m.tiktok.com") return true;
    if (host.endsWith("tiktok.com") && /^\/t\/[^/]+/.test(u.pathname)) return true;
    if (host.endsWith("tiktok.com") && /^\/[A-Za-z0-9]{5,16}\/?$/.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

async function expandTikTok(url: string): Promise<string> {
  if (tiktokVideoId(url) && !isShortTikTok(url)) return url;
  try {
    const res = await safeFetch(url, { method: "GET", timeoutMs: 8000, maxRedirects: 6 });
    const loc = res.headers.get("location");
    const next = res.url && res.url !== url ? res.url : loc ? new URL(loc, url).toString() : url;
    return next;
  } catch {
    return url;
  }
}

async function fromTikwm(url: string): Promise<ExtractResult | null> {
  try {
    const data = await fetchJson<Tikwm>(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
      undefined,
      12000,
    );
    if (data.code !== 0 || !data.data) return null;
    const d = data.data;
    const images = Array.isArray(d.images) ? d.images.filter((u) => typeof u === "string" && u.startsWith("http")) : [];
    const photo = isTikTokPhotoUrl(url) || (images.length > 0 && (!d.duration || d.duration <= 1));
    if (photo && images.length) {
      return {
        platform: "tiktok",
        id: d.id,
        title: d.title,
        author: d.author?.nickname,
        authorHandle: d.author?.unique_id ? `@${d.author.unique_id}` : undefined,
        text: d.title,
        sourceUrl: url,
        items: images.slice(0, 10).map((img) => ({
          kind: "photo" as const,
          url: img,
          thumbnail: img,
          variants: [{ url: img, quality: "أصل", contentType: "image/jpeg" }],
        })),
      };
    }
    const items: MediaItem[] = [];
    const variants: MediaVariant[] = [];
    const addVideo = (u?: string, quality?: string) => {
      if (!u || isTikTokMusicCdn(u)) return;
      if (variants.some((v) => v.url === u)) return;
      variants.push(variant(u, quality ?? "أصل"));
    };
    addVideo(d.hdplay, "HD");
    addVideo(d.play, "بدون علامة");
    addVideo(d.wmplay, "بعلامة");
    if (variants.length) {
      items.push({
        kind: "video",
        url: variants[0]!.url,
        thumbnail: d.origin_cover ?? d.cover,
        duration: d.duration,
        variants,
      });
    } else if (d.images && d.images.length > 0) {
      for (const img of d.images) {
        items.push({
          kind: "photo",
          url: img,
          thumbnail: img,
          variants: [{ url: img, quality: "أصل", contentType: "image/jpeg" }],
        });
      }
    }
    if (!items.length) return null;
    return {
      platform: "tiktok",
      id: d.id,
      title: d.title,
      author: d.author?.nickname,
      authorHandle: d.author?.unique_id ? `@${d.author.unique_id}` : undefined,
      text: d.title,
      sourceUrl: url,
      items,
    };
  } catch {
    return null;
  }
}

export async function extractTikTok(url: string): Promise<ExtractResult> {
  const expanded = await expandTikTok(url);
  const fromApi = await fromTikwm(expanded);
  if (fromApi) {
    for (const item of fromApi.items) {
      item.variants = item.variants.filter((v) => !/tikcdn\.io|ssstik\.io/i.test(v.url));
      if (/tikcdn\.io|ssstik\.io/i.test(item.url)) {
        item.url = item.variants[0]?.url ?? item.url;
      }
    }
    if (fromApi.items.length) return { ...fromApi, sourceUrl: expanded };
  }

  throw new Error(
    isTikTokPhotoUrl(expanded)
      ? "ما قدرت أحمّل صور تيك توك من هذا الرابط. أعد إرسال الرابط من التطبيق."
      : "ما قدرت أحمّل فيديو تيك توك. أرسل الرابط الكامل من التطبيق.",
  );
}
