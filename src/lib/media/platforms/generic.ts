import { fetchText } from "../http";
import type { ExtractResult, MediaItem } from "../types";
import { qualityLabel } from "../urls";

function metas(html: string, prop: string): string[] {
  const out: string[] = [];
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "gi",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "gi",
  );
  for (const r of [re, re2]) {
    for (const m of html.matchAll(r)) {
      if (m[1]) out.push(m[1].split("&" + "amp;").join("&"));
    }
  }
  return [...new Set(out)];
}

export async function extractGeneric(url: string): Promise<ExtractResult> {
  const { text, finalUrl } = await fetchText(url, undefined, 12000);
  const videos = [
    ...metas(text, "og:video"),
    ...metas(text, "og:video:url"),
    ...metas(text, "og:video:secure_url"),
    ...metas(text, "twitter:player:stream"),
  ].filter((u) => /^https?:\/\//.test(u) && !u.includes(".m3u8"));

  const images = [
    ...metas(text, "og:image"),
    ...metas(text, "og:image:url"),
    ...metas(text, "twitter:image"),
  ].filter((u) => /^https?:\/\//.test(u));

  const title = metas(text, "og:title")[0] ?? metas(text, "twitter:title")[0];
  const desc = metas(text, "og:description")[0];

  const items: MediaItem[] = [];
  for (const v of videos) {
    items.push({
      kind: "video",
      url: v,
      thumbnail: images[0],
      variants: [{ url: v, quality: qualityLabel(), contentType: "video/mp4" }],
    });
  }
  if (items.length === 0) {
    for (const img of images.slice(0, 4)) {
      items.push({
        kind: "photo",
        url: img,
        thumbnail: img,
        variants: [{ url: img, quality: "أصل", contentType: "image/jpeg" }],
      });
    }
  }
  if (items.length === 0) {
    throw new Error("ما لقيت فيديو أو صورة قابلة للتحميل في الرابط");
  }
  return {
    platform: "generic",
    title,
    text: desc,
    sourceUrl: finalUrl,
    items,
  };
}
