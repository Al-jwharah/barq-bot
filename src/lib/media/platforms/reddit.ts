import { fetchJson } from "../http";
import type { ExtractResult, MediaItem } from "../types";
import { qualityLabel } from "../urls";

type RedditPost = {
  data?: {
    title?: string;
    author?: string;
    url?: string;
    permalink?: string;
    is_video?: boolean;
    preview?: {
      images?: Array<{
        source?: { url?: string; width?: number; height?: number };
      }>;
    };
    media?: {
      reddit_video?: {
        fallback_url?: string;
        duration?: number;
        width?: number;
        height?: number;
        is_gif?: boolean;
      };
    };
    secure_media?: {
      reddit_video?: {
        fallback_url?: string;
        duration?: number;
        width?: number;
        height?: number;
        is_gif?: boolean;
      };
    };
    gallery_data?: { items?: Array<{ media_id?: string }> };
    media_metadata?: Record<
      string,
      { s?: { u?: string; gif?: string; mp4?: string; x?: number; y?: number } }
    >;
  };
};

export async function extractReddit(url: string): Promise<ExtractResult> {
  const jsonUrl = url.replace(/\/?(\?.*)?$/, "") + ".json";
  const data = await fetchJson<unknown>(jsonUrl, {
    headers: { Accept: "application/json" },
  });
  const listing = Array.isArray(data) ? data[0] : data;
  const post = (listing as { data?: { children?: RedditPost[] } })?.data
    ?.children?.[0]?.data;
  if (!post) throw new Error("ما قدرت أقرأ منشور ردّيت");

  const items: MediaItem[] = [];
  const video =
    post.media?.reddit_video ?? post.secure_media?.reddit_video ?? undefined;
  if (video?.fallback_url) {
    items.push({
      kind: video.is_gif ? "gif" : "video",
      url: video.fallback_url,
      width: video.width,
      height: video.height,
      duration: video.duration,
      thumbnail: post.preview?.images?.[0]?.source?.url?.replace(/&/g, "&"),
      variants: [
        {
          url: video.fallback_url,
          quality: qualityLabel(video.width, video.height),
          width: video.width,
          height: video.height,
          contentType: "video/mp4",
        },
      ],
    });
  }

  if (post.gallery_data?.items && post.media_metadata) {
    for (const item of post.gallery_data.items) {
      const meta = item.media_id ? post.media_metadata[item.media_id] : undefined;
      const src = meta?.s?.mp4 || meta?.s?.gif || meta?.s?.u;
      if (!src) continue;
      const clean = src.replace(/&/g, "&");
      items.push({
        kind: meta?.s?.mp4 ? "gif" : "photo",
        url: clean,
        width: meta?.s?.x,
        height: meta?.s?.y,
        variants: [
          {
            url: clean,
            quality: "أصل",
            width: meta?.s?.x,
            height: meta?.s?.y,
            contentType: meta?.s?.mp4 ? "video/mp4" : "image/jpeg",
          },
        ],
      });
    }
  }

  if (items.length === 0 && post.preview?.images?.[0]?.source?.url) {
    const img = post.preview.images[0].source.url.replace(/&/g, "&");
    items.push({
      kind: "photo",
      url: img,
      width: post.preview.images[0].source.width,
      height: post.preview.images[0].source.height,
      variants: [{ url: img, quality: "أصل", contentType: "image/jpeg" }],
    });
  }

  if (items.length === 0) {
    throw new Error("المنشور ما فيه فيديو أو صورة مباشرة");
  }

  return {
    platform: "reddit",
    title: post.title,
    author: post.author,
    authorHandle: post.author ? `u/${post.author}` : undefined,
    text: post.title,
    sourceUrl: post.permalink
      ? `https://www.reddit.com${post.permalink}`
      : url,
    items,
  };
}
