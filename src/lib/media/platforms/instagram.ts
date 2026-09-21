import { fetchText } from "../http";
import type { ExtractResult, MediaItem } from "../types";
import { instagramShortcode, qualityLabel } from "../urls";

function unescapeJson(s: string): string {
  return s
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"');
}

function igUpgradeImage(url: string): string {
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/s\d{2,4}x\d{2,4}\//g, "/");
    const stp = u.searchParams.get("stp");
    if (stp) u.searchParams.set("stp", stp.replace(/_s\d{2,4}x\d{2,4}/g, "").replace(/p\d+x\d+/g, "p1080x1080"));
    return u.toString();
  } catch {
    return url;
  }
}

function rankImage(url: string): number {
  const m = url.match(/(\d{3,4})x(\d{3,4})/);
  if (m) return Number(m[1]) * Number(m[2]);
  return 1080 * 1080;
}

export async function extractInstagram(url: string): Promise<ExtractResult> {
  const code = instagramShortcode(url);
  const pageUrl = code
    ? `https://www.instagram.com/p/${code}/embed/captioned/`
    : url;

  const { text } = await fetchText(pageUrl, undefined, 12000);

  const videos = [
    ...text.matchAll(
      /(?:video_url|og:video|property="og:video" content)["=\s:]+["']?(https?:\/\/[^"'<\s]+)/gi,
    ),
  ]
    .map((m) => unescapeJson(m[1] ?? ""))
    .filter((u) => u.startsWith("http") && !u.includes("static.cdninstagram.com/rsrc.php"));

  const images = [
    ...text.matchAll(
      /(?:og:image|display_url|"src")["=\s:]+["']?(https?:\/\/[^"'<\s]+\.(?:jpg|jpeg|png|webp)[^"'<\s]*)/gi,
    ),
    ...text.matchAll(/"display_resources"\s*:\s*\[[^\]]*"src"\s*:\s*"(https?:\\\/\\\/[^"]+)"/gi),
  ]
    .map((m) => igUpgradeImage(unescapeJson(m[1] ?? "")))
    .filter((u) => u.startsWith("http") && !u.includes("rsrc.php"));

  const uniqueVideos = [...new Set(videos)];
  const uniqueImages = [...new Set(images)].sort((a, b) => rankImage(b) - rankImage(a)).slice(0, 8);

  const items: MediaItem[] = [];
  for (const v of uniqueVideos) {
    items.push({
      kind: "video",
      url: v,
      thumbnail: uniqueImages[0],
      variants: [
        {
          url: v,
          quality: qualityLabel(),
          contentType: "video/mp4",
        },
      ],
    });
  }
  if (items.length === 0) {
    for (const img of uniqueImages) {
      items.push({
        kind: "photo",
        url: img,
        thumbnail: img,
        variants: [{ url: img, quality: "أصل", contentType: "image/jpeg" }],
      });
    }
  }
  if (items.length === 0) {
    throw new Error("ما قدرت أقرأ الميديا من إنستغرام. جرّب رابط عام");
  }

  const caption =
    text.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, " ").trim() ??
    undefined;

  return {
    platform: "instagram",
    id: code,
    text: caption,
    sourceUrl: url,
    items,
  };
}
