import { fetchText } from "../http";
import type { ExtractResult, MediaItem } from "../types";
import { qualityLabel } from "../urls";
import { extractGeneric } from "./generic";

function unescapeFb(s: string): string {
  return s
    .replace(/\\u0025/g, "%")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');
}

function collect(html: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    const raw = unescapeFb(m[1] ?? "");
    if (raw.startsWith("http") && !raw.includes(".m3u8")) out.push(raw);
  }
  return [...new Set(out)];
}

export async function extractFacebook(url: string): Promise<ExtractResult> {
  try {
    const { text, finalUrl } = await fetchText(url, undefined, 14000);
    const videos = [
      ...collect(text, /"playable_url_quality_hd":"([^"]+)"/g),
      ...collect(text, /"playable_url":"([^"]+)"/g),
      ...collect(text, /"browser_native_hd_url":"([^"]+)"/g),
      ...collect(text, /"browser_native_sd_url":"([^"]+)"/g),
      ...collect(text, /hd_src(?:_no_ratelimit)?["\s:]+["'](https?:[^"'\\]+)["']/g),
      ...collect(text, /og:video(?::url|:secure_url)?["'\s>]+content=["'](https?:[^"']+)/g),
    ];
    const images = collect(
      text,
      /og:image["'\s>]+content=["'](https?:[^"']+)/g,
    );
    const titleMatch = text.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i,
    );
    if (videos.length) {
      const items: MediaItem[] = videos.slice(0, 4).map((v, i) => ({
        kind: "video" as const,
        url: v,
        thumbnail: images[0],
        variants: [
          {
            url: v,
            quality: i === 0 ? "HD" : qualityLabel(),
            contentType: "video/mp4",
          },
        ],
      }));
      return {
        platform: "facebook",
        title: titleMatch?.[1],
        sourceUrl: finalUrl,
        items,
      };
    }
  } catch {
    /* generic */
  }
  const fallback = await extractGeneric(url);
  return { ...fallback, platform: "facebook" };
}
