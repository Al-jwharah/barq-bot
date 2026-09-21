import { fetchJson } from "../http";
import type { ExtractResult, MediaItem, MediaVariant } from "../types";
import { qualityLabel, vimeoIdFromUrl } from "../urls";

type VimeoProgressive = {
  url?: string;
  width?: number;
  height?: number;
  quality?: string;
  mime?: string;
};

type VimeoConfig = {
  video?: {
    title?: string;
    owner?: { name?: string };
    duration?: number;
    thumbs?: Record<string, string>;
  };
  request?: {
    files?: {
      progressive?: VimeoProgressive[];
    };
  };
};

export async function extractVimeo(url: string): Promise<ExtractResult> {
  const id = vimeoIdFromUrl(url);
  if (!id) throw new Error("رابط فيميو غير صالح");
  const config = await fetchJson<VimeoConfig>(
    `https://player.vimeo.com/video/${id}/config`,
    { headers: { Referer: "https://vimeo.com" } },
    12000,
  );
  const progressive = config.request?.files?.progressive ?? [];
  const variants: MediaVariant[] = progressive
    .filter((p): p is VimeoProgressive & { url: string } => Boolean(p.url))
    .map((p) => ({
      url: p.url,
      quality: qualityLabel(p.width, p.height) || p.quality || "أصل",
      width: p.width,
      height: p.height,
      contentType: p.mime || "video/mp4",
    }))
    .sort(
      (a, b) =>
        (b.height ?? 0) * (b.width ?? 0) - (a.height ?? 0) * (a.width ?? 0),
    );
  if (variants.length === 0) {
    throw new Error("ما لقيت ملف فيديو في فيميو");
  }
  const thumbs = config.video?.thumbs ?? {};
  const thumb =
    thumbs.base ?? thumbs["1280"] ?? thumbs["640"] ?? Object.values(thumbs)[0];
  const best = variants[0]!;
  const item: MediaItem = {
    kind: "video",
    url: best.url,
    thumbnail: thumb,
    width: best.width,
    height: best.height,
    duration: config.video?.duration,
    variants,
  };
  return {
    platform: "vimeo",
    id,
    title: config.video?.title,
    author: config.video?.owner?.name,
    sourceUrl: `https://vimeo.com/${id}`,
    items: [item],
  };
}
