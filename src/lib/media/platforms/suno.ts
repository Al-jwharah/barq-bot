import { mediaHeaders } from "../http";
import type { ExtractResult } from "../types";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SONG_ID = new RegExp(`/(?:song|embed)/(${UUID})`, "i");
const SHARE_CODE = /\/s\/([A-Za-z0-9_-]{6,32})\/?$/i;

export function sunoSongId(url: string): string | null {
  const match = url.match(SONG_ID);
  return match?.[1]?.toLowerCase() ?? null;
}

export function sunoShareCode(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const match = path.match(SHARE_CODE);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function browserToken(): string {
  return JSON.stringify({
    token: Buffer.from(JSON.stringify({ timestamp: Date.now() })).toString("base64"),
  });
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

function pickId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  for (const key of ["content_id", "clip_id", "song_id", "id"]) {
    const id = row[key];
    if (typeof id === "string" && new RegExp(`^${UUID}$`, "i").test(id)) return id.toLowerCase();
  }
  for (const nested of [row.content, row.clip, row.song, row.data]) {
    const id = pickId(nested);
    if (id) return id;
  }
  const link = row.link || row.url || row.canonical_url;
  if (typeof link === "string") return sunoSongId(link);
  return null;
}

async function resolveShare(code: string): Promise<string | null> {
  try {
    const res = await fetch(`https://studio-api-prod.suno.com/api/share/code/${encodeURIComponent(code)}`, {
      headers: mediaHeaders(
        {
          Accept: "application/json",
          Origin: "https://suno.com",
          Referer: `https://suno.com/s/${code}`,
          "Browser-Token": browserToken(),
        },
        "https://suno.com/",
      ),
    });
    if (!res.ok) return null;
    return pickId(await res.json());
  } catch {
    return null;
  }
}

type Clip = {
  id?: string;
  title?: string;
  video_url?: string;
  audio_url?: string;
  image_large_url?: string;
  image_url?: string;
  status?: string;
};

async function loadClip(id: string): Promise<Clip | null> {
  try {
    const res = await fetch(`https://studio-api-prod.suno.com/api/clip/${id}`, {
      headers: mediaHeaders(
        { Accept: "application/json", Origin: "https://suno.com", Referer: "https://suno.com/" },
        "https://suno.com/",
      ),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Clip;
    return data?.id ? data : null;
  } catch {
    return null;
  }
}

export async function extractSuno(url: string): Promise<ExtractResult> {
  let id = sunoSongId(url);
  if (!id) {
    const code = sunoShareCode(url);
    if (code) id = await resolveShare(code);
  }
  if (!id) {
    throw new Error("رابط Suno المختصر ما فتح الأغنية. افتحها وانسخ الرابط الذي فيه /song/.");
  }

  const clip = await loadClip(id);
  const title = clip?.title;
  const cover = clip?.image_large_url || clip?.image_url;
  const candidates = [
    clip?.video_url,
    `https://cdn1.suno.ai/${id}.mp4`,
  ].filter((u): u is string => typeof u === "string" && !/\/api\/forbidden/i.test(u));

  for (const video of candidates) {
    if (!(await playable(video))) continue;
    return {
      platform: "suno",
      id,
      title,
      sourceUrl: `https://suno.com/song/${id}`,
      items: [
        {
          kind: "video",
          url: video,
          thumbnail: cover,
          variants: [{ url: video, quality: "فيديو", contentType: "video/mp4" }],
        },
      ],
    };
  }

  const audio = clip?.audio_url;
  if (audio && !/\/api\/forbidden/i.test(audio) && (await playable(audio))) {
    return {
      platform: "suno",
      id,
      title,
      sourceUrl: `https://suno.com/song/${id}`,
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

  throw new Error("ما لقيت فيديو هذه الأغنية على Suno.");
}
