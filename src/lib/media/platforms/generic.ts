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

function looksLikeImage(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|bmp|svg|avif)(\?|$)/i.test(url);
}

export function videoUrlsFromHtml(html: string): string[] {
  const meta = [
    ...metas(html, "og:video"),
    ...metas(html, "og:video:url"),
    ...metas(html, "og:video:secure_url"),
    ...metas(html, "twitter:player:stream"),
  ];
  const tags = [...html.matchAll(/<(?:video|source)\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1] ?? "");
  const json = [...html.matchAll(/"contentUrl"\s*:\s*"(https?:[^"]+)"/gi)].map((m) =>
    (m[1] ?? "").replace(/\\u0026/g, "&").replace(/\\\//g, "/"),
  );
  return [...new Set([...meta, ...tags, ...json])]
    .map((u) => u.split("&" + "amp;").join("&").trim())
    .filter((u) => /^https?:\/\//.test(u) && !u.includes(".m3u8") && !looksLikeImage(u));
}

export async function extractGeneric(url: string): Promise<ExtractResult> {
  const { text, finalUrl } = await fetchText(url, undefined, 12000);
  const videos = videoUrlsFromHtml(text);
  const title = metas(text, "og:title")[0] ?? metas(text, "twitter:title")[0];
  const desc = metas(text, "og:description")[0];
  if (videos.length === 0) {
    throw new Error("ما لقيت فيديو قابل للتحميل في هذا الرابط. أرسل رابط المقطع نفسه.");
  }
  const items: MediaItem[] = videos.map((v) => ({
    kind: "video",
    url: v,
    variants: [{ url: v, quality: qualityLabel(), contentType: "video/mp4" }],
  }));
  return {
    platform: "generic",
    title,
    text: desc,
    sourceUrl: finalUrl,
    items,
  };
}
