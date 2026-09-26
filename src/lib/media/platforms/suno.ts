import { fetchText, mediaHeaders } from "../http";
import type { ExtractResult, MediaItem } from "../types";

const SONG_ID =
  /\/(?:song|embed|s)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function sunoSongId(url: string): string | null {
  const match = url.match(SONG_ID);
  return match?.[1]?.toLowerCase() ?? null;
}

function meta(html: string, prop: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m = html.match(re);
  const value = m?.[1] || m?.[2];
  return value ? value.split("&").join("&") : undefined;
}

function abs(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function playable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: mediaHeaders({ Range: "bytes=0-1" }, url),
      redirect: "follow",
    });
    if (res.status !== 200 && res.status !== 206) return false;
    const type = (res.headers.get("content-type") || "").toLowerCase();
    return /video|audio|mp4|mpeg|octet-stream/.test(type);
  } catch {
    return false;
  }
}

export async function extractSuno(url: string): Promise<ExtractResult> {
  const id = sunoSongId(url);
  if (!id) throw new Error("أرسل رابط الأغنية من Suno، مثل suno.com/song/…");

  let html = "";
  let finalUrl = url;
  try {
    const page = await fetchText(url, undefined, 12000);
    html = page.text;
    finalUrl = page.finalUrl || url;
  } catch {
    html = "";
  }

  const found = html.match(/https?:\/\/[^"'\\\s>]+\.(?:mp4|m4a|mp3)(?:\?[^"'\\\s>]*)?/gi) ?? [];
  const videos: string[] = [];
  const audios: string[] = [];
  const push = (raw: string | null | undefined, list: string[]) => {
    if (!raw || list.includes(raw)) return;
    if (/sil-100\.mp3|favicon|image_/i.test(raw)) return;
    list.push(raw);
  };
  push(`https://cdn1.suno.ai/${id}.mp4`, videos);
  for (const raw of found) {
    const u = abs(raw, finalUrl);
    if (!u || !u.toLowerCase().includes(id)) continue;
    if (/\.mp4(?:\?|$)/i.test(u)) push(u, videos);
    else push(u, audios);
  }
  push(`https://cdn1.suno.ai/${id}.mp3`, audios);

  const title = html ? meta(html, "og:title")?.replace(/\s*\|\s*Suno\s*$/i, "") : undefined;
  const cover = html
    ? [`https://cdn2.suno.ai/image_large_${id}.jpeg`, meta(html, "og:image")].find(
        (u) => u && !/favicon/i.test(u),
      )
    : `https://cdn2.suno.ai/image_large_${id}.jpeg`;

  for (const video of videos) {
    if (!(await playable(video))) continue;
    const item: MediaItem = {
      kind: "video",
      url: video,
      thumbnail: cover,
      variants: [{ url: video, quality: "فيديو", contentType: "video/mp4" }],
    };
    return {
      platform: "suno",
      id,
      title,
      sourceUrl: finalUrl,
      items: [item],
    };
  }

  for (const audio of audios) {
    if (!(await playable(audio))) continue;
    return {
      platform: "suno",
      id,
      title,
      sourceUrl: finalUrl,
      items: [
        {
          kind: "audio",
          url: audio,
          thumbnail: cover,
          variants: [{ url: audio, quality: "صوت", contentType: "audio/mp4" }],
        },
      ],
    };
  }

  throw new Error("ما لقيت فيديو الأغنية على Suno. أعد إرسال رابط song.");
}
