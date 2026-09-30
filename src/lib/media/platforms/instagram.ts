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

function parseEmbed(text: string): { videos: string[]; images: string[]; caption?: string } {
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

  const caption =
    text.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, " ").trim() ??
    undefined;

  return { videos: [...new Set(videos)], images: [...new Set(images)], caption };
}

function embedCandidates(code: string | null, url: string): string[] {
  if (!code) return [url];
  const bases = [
    `https://www.instagram.com/p/${code}/embed/captioned/`,
    `https://www.instagram.com/reel/${code}/embed/captioned/`,
    `https://www.instagram.com/tv/${code}/embed/captioned/`,
    `https://www.instagram.com/p/${code}/embed/`,
    `https://www.instagram.com/reel/${code}/embed/`,
  ];
  return [...new Set(bases)];
}

export async function extractInstagram(url: string): Promise<ExtractResult> {
  const code = instagramShortcode(url);
  let bestVideos: string[] = [];
  let bestImages: string[] = [];
  let caption: string | undefined;

  for (const pageUrl of embedCandidates(code ?? null, url)) {
    try {
      const { text } = await fetchText(pageUrl, undefined, 12000);
      const parsed = parseEmbed(text);
      if (parsed.videos.length > bestVideos.length) bestVideos = parsed.videos;
      if (parsed.images.length > bestImages.length) {
        bestImages = parsed.images.sort((a, b) => rankImage(b) - rankImage(a)).slice(0, 8);
      }
      if (!caption && parsed.caption) caption = parsed.caption;
      if (bestVideos.length) break;
    } catch {
      /* try next embed shape */
    }
  }

  const items: MediaItem[] = [];
  for (const v of bestVideos) {
    items.push({
      kind: "video",
      url: v,
      thumbnail: bestImages[0],
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
    for (const img of bestImages) {
      items.push({
        kind: "photo",
        url: img,
        thumbnail: img,
        variants: [{ url: img, quality: "أصل", contentType: "image/jpeg" }],
      });
    }
  }

  if (items.length === 0) {
    try {
      const { extractWithYtdlp } = await import("../ytdlp");
      const viaYt = await extractWithYtdlp(url, "instagram");
      if (viaYt.items.length) {
        return { ...viaYt, platform: "instagram", id: code ?? viaYt.id, sourceUrl: url };
      }
    } catch {
      /* fall through */
    }
    throw new Error("ما قدرت أقرأ الميديا من إنستغرام. جرّب رابط منشور عام (مو خاص).");
  }

  return {
    platform: "instagram",
    id: code,
    text: caption,
    sourceUrl: url,
    items,
  };
}
