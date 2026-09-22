import type { ExtractResult, MediaItem } from "./types";

export type LinkPreview = {
  platform: string;
  sourceUrl: string;
  title?: string;
  author?: string;
  authorHandle?: string;
  text?: string;
  thumbnail?: string;
  durationSec?: number;
  durationLabel?: string | null;
  kind?: string;
  width?: number;
  height?: number;
  sizeEstimateBytes?: number;
  sizeEstimateLabel?: string | null;
  qualities: Array<{ quality: string; width?: number; height?: number; size?: number; sizeLabel?: string | null }>;
  botDeepLink: string;
};

export function formatBytes(n?: number): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n > 20 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function formatDuration(sec?: number): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function platformLabelAr(p: string): string {
  switch (p) {
    case "x":
      return "إكس";
    case "tiktok":
      return "تيك توك";
    case "instagram":
      return "إنستغرام";
    case "youtube":
      return "يوتيوب";
    case "reddit":
      return "ردّيت";
    case "threads":
      return "ثريدز";
    case "facebook":
      return "فيسبوك";
    case "vimeo":
      return "فيميو";
    case "direct":
      return "ملف";
    default:
      return "رابط";
  }
}

function estimateSize(item: MediaItem): number | undefined {
  const withSize = item.variants.find((v) => v.size && v.size > 0);
  if (withSize?.size) return withSize.size;
  // Rough estimate from duration × bitrate heuristic when size missing
  if (item.duration && item.duration > 0) {
    const h = item.height ?? item.variants[0]?.height ?? 720;
    const mbps = h >= 1080 ? 4.5 : h >= 720 ? 2.5 : 1.2;
    return Math.round(item.duration * mbps * 1024 * 1024 / 8);
  }
  return undefined;
}

export function toLinkPreview(result: ExtractResult, botUsername = "barq_ibot"): LinkPreview {
  const primary = result.items[0];
  const sizeEstimateBytes = primary ? estimateSize(primary) : undefined;
  const qualities = (primary?.variants ?? []).slice(0, 6).map((v) => ({
    quality: v.quality,
    width: v.width,
    height: v.height,
    size: v.size,
    sizeLabel: formatBytes(v.size),
  }));
  const deep = `https://t.me/${botUsername}?start=dl`;
  return {
    platform: result.platform,
    sourceUrl: result.sourceUrl,
    title: result.title ?? result.text?.slice(0, 120),
    author: result.author,
    authorHandle: result.authorHandle,
    text: result.text,
    thumbnail: primary?.thumbnail,
    durationSec: primary?.duration,
    durationLabel: formatDuration(primary?.duration),
    kind: primary?.kind,
    width: primary?.width ?? primary?.variants[0]?.width,
    height: primary?.height ?? primary?.variants[0]?.height,
    sizeEstimateBytes,
    sizeEstimateLabel: formatBytes(sizeEstimateBytes),
    qualities,
    botDeepLink: deep,
  };
}
