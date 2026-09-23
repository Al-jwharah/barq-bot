import { fetchJson } from "../http";
import { extractWithYtdlp } from "../ytdlp";
import type { ExtractResult, MediaItem, MediaVariant } from "../types";
import { qualityLabel, youtubeIdFromUrl } from "../urls";

type YtFormat = {
  itag?: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  qualityLabel?: string;
  audioQuality?: string;
  contentLength?: string;
  approxDurationMs?: string;
};

type YtPlayer = {
  videoDetails?: {
    title?: string;
    author?: string;
    lengthSeconds?: string;
    thumbnail?: { thumbnails?: Array<{ url?: string }> };
  };
  streamingData?: {
    formats?: YtFormat[];
    adaptiveFormats?: YtFormat[];
  };
  playabilityStatus?: { status?: string; reason?: string };
};

const CLIENTS: Array<{ name: string; version: string; clientId: string; ua: string }> = [
  {
    name: "ANDROID",
    version: "20.10.38",
    clientId: "3",
    ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
  },
  {
    name: "ANDROID_VR",
    version: "1.61.48",
    clientId: "28",
    ua: "com.google.android.apps.youtube.vr.oculus/1.61.48",
  },
  {
    name: "IOS",
    version: "20.10.4",
    clientId: "5",
    ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X)",
  },
  {
    name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    version: "2.0",
    clientId: "85",
    ua: "Mozilla/5.0 (ChromiumStyle TV) Cobalt/Version",
  },
  {
    name: "WEB",
    version: "2.20260331.01.00",
    clientId: "1",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
];

async function innertube(videoId: string, client: (typeof CLIENTS)[number]) {
  return fetchJson<YtPlayer>("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YouTube-Client-Name": client.clientId,
      "User-Agent": client.ua,
      Origin: "https://www.youtube.com",
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: client.name,
          clientVersion: client.version,
          hl: "en",
          gl: "US",
          androidSdkVersion: client.name.startsWith("ANDROID") ? 33 : undefined,
        },
      },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });
}

function muxedVariants(player: YtPlayer): MediaVariant[] {
  const all = [
    ...(player.streamingData?.formats ?? []),
    ...(player.streamingData?.adaptiveFormats ?? []),
  ];
  return all
    .filter((f) => {
      if (!f.url) return false;
      const mime = f.mimeType ?? "";
      const hasVideo = mime.includes("video") || Boolean(f.width || f.height);
      const hasAudio = Boolean(f.audioQuality) || mime.includes("mp4a") || mime.includes("audio");
      return hasVideo && hasAudio && mime.includes("video");
    })
    .map((f) => ({
      url: f.url as string,
      quality: f.qualityLabel ?? qualityLabel(f.width, f.height),
      width: f.width,
      height: f.height,
      bitrate: f.bitrate,
      size: f.contentLength ? Number(f.contentLength) : undefined,
      contentType: f.mimeType?.split(";")[0] ?? "video/mp4",
    }))
    .sort((a, b) => {
      const rank = (h?: number) => {
        if (!h) return 9;
        if (h >= 360 && h <= 480) return 0;
        if (h < 360) return 1;
        if (h <= 720) return 2;
        return 3;
      };
      return rank(a.height) - rank(b.height) || (a.size ?? 0) - (b.size ?? 0);
    });
}

function fromPlayer(id: string, player: YtPlayer, variants: MediaVariant[]): ExtractResult {
  const thumbs = player.videoDetails?.thumbnail?.thumbnails ?? [];
  const thumb = thumbs[thumbs.length - 1]?.url;
  const duration = player.videoDetails?.lengthSeconds
    ? Number(player.videoDetails.lengthSeconds)
    : undefined;
  const items: MediaItem[] = [
    {
      kind: "video",
      url: variants[0]!.url,
      thumbnail: thumb,
      width: variants[0]!.width,
      height: variants[0]!.height,
      duration,
      variants,
    },
  ];
  return {
    platform: "youtube",
    id,
    title: player.videoDetails?.title,
    author: player.videoDetails?.author,
    text: player.videoDetails?.title,
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    items,
  };
}

async function extractPiped(id: string): Promise<ExtractResult | null> {
  const bases = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://pipedapi.darkness.services",
  ];
  for (const base of bases) {
    try {
      const data = await fetchJson<{
        title?: string;
        uploader?: string;
        thumbnailUrl?: string;
        duration?: number;
        videoStreams?: Array<{ url?: string; quality?: string; mimeType?: string; videoOnly?: boolean; bitrate?: number; width?: number; height?: number }>;
      }>(`${base}/streams/${id}`, undefined, 12000);
      const muxed = (data.videoStreams ?? []).filter((s) => s.url && !s.videoOnly);
      const pick = muxed.sort((a, b) => (a.height ?? 9999) - (b.height ?? 9999))[0]
        ?? muxed[0];
      if (!pick?.url) continue;
      return {
        platform: "youtube",
        id,
        title: data.title,
        author: data.uploader,
        text: data.title,
        sourceUrl: `https://www.youtube.com/watch?v=${id}`,
        items: [
          {
            kind: "video",
            url: pick.url,
            thumbnail: data.thumbnailUrl,
            width: pick.width,
            height: pick.height,
            duration: data.duration,
            variants: muxed.slice(0, 6).map((s) => ({
              url: s.url!,
              quality: s.quality || qualityLabel(s.width, s.height),
              width: s.width,
              height: s.height,
              bitrate: s.bitrate,
              contentType: s.mimeType?.split(";")[0] || "video/mp4",
            })),
          },
        ],
      };
    } catch {
      /* next instance */
    }
  }
  return null;
}

async function extractInvidious(id: string): Promise<ExtractResult | null> {
  const bases = [
    "https://invidious.f5.si",
    "https://invidious.tiekoetter.com",
    "https://yt.cdaut.de",
  ];
  for (const base of bases) {
    try {
      const data = await fetchJson<{
        title?: string;
        author?: string;
        videoThumbnails?: Array<{ url?: string }>;
        lengthSeconds?: number;
        formatStreams?: Array<{
          url?: string;
          qualityLabel?: string;
          type?: string;
          itag?: string;
          width?: number;
          height?: number;
          size?: string;
        }>;
      }>(`${base}/api/v1/videos/${encodeURIComponent(id)}`, undefined, 12000);
      const muxed = (data.formatStreams ?? []).filter((s) => s.url);
      const pick = muxed.sort((a, b) => (a.height ?? 9999) - (b.height ?? 9999))[0] ?? muxed[0];
      if (!pick?.url) continue;
      const thumb = data.videoThumbnails?.[data.videoThumbnails.length - 1]?.url;
      return {
        platform: "youtube",
        id,
        title: data.title,
        author: data.author,
        text: data.title,
        sourceUrl: `https://www.youtube.com/watch?v=${id}`,
        items: [
          {
            kind: "video",
            url: pick.url,
            thumbnail: thumb,
            width: pick.width,
            height: pick.height,
            duration: data.lengthSeconds,
            variants: muxed.slice(0, 6).map((s) => ({
              url: s.url!,
              quality: s.qualityLabel || qualityLabel(s.width, s.height),
              width: s.width,
              height: s.height,
              size: s.size ? Number(s.size) : undefined,
              contentType: s.type?.split(";")[0] || "video/mp4",
            })),
          },
        ],
      };
    } catch {
      /* next instance */
    }
  }
  return null;
}

async function extractCobalt(url: string, id: string): Promise<ExtractResult | null> {
  const endpoints = ["https://api.cobalt.tools/", "https://cobalt-api.kwiatekmiki.com/"];
  for (const endpoint of endpoints) {
    try {
      const data = await fetchJson<{ status?: string; url?: string; filename?: string }>(
        endpoint,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url, videoQuality: "480", downloadMode: "auto" }),
        },
        20000,
      );
      if (!data.url || (data.status !== "tunnel" && data.status !== "redirect" && data.status !== "stream")) {
        continue;
      }
      return {
        platform: "youtube",
        id,
        sourceUrl: `https://www.youtube.com/watch?v=${id}`,
        items: [
          {
            kind: "video",
            url: data.url,
            variants: [{ url: data.url, quality: "720p", contentType: "video/mp4" }],
          },
        ],
      };
    } catch {
      /* next */
    }
  }
  return null;
}

export async function extractYouTube(url: string): Promise<ExtractResult> {
  const id = youtubeIdFromUrl(url);
  if (!id) throw new Error("هذا مو رابط يوتيوب واضح");
  const watch = `https://www.youtube.com/watch?v=${id}`;

  for (const client of CLIENTS) {
    try {
      const player = await innertube(id, client);
      if (player.playabilityStatus?.status === "LOGIN_REQUIRED") continue;
      const variants = muxedVariants(player);
      if (variants.length) return fromPlayer(id, player, variants);
    } catch {
      /* next client */
    }
  }

  const piped = await extractPiped(id);
  if (piped) return piped;

  const invidious = await extractInvidious(id);
  if (invidious) return invidious;

  const cobalt = await extractCobalt(watch, id);
  if (cobalt) return cobalt;

  try {
    return await extractWithYtdlp(watch, "youtube");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("تحقق") || msg.includes("تليجرام")) throw err;
    throw new Error("ما قدرت أجيب ملف يوتيوب. افتح الرابط من الموقع للتحميل المباشر.");
  }
}
