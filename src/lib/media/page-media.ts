/**
 * Site-agnostic media discovery from a page's HTML.
 * No platform lists: reads the open standards every video page tends to expose
 * (og:video, twitter:player, <video>/<source>, <iframe> players, JSON-LD
 * VideoObject, and raw .mp4/.m3u8/.mpd strings inside scripts).
 */

export type MediaCandidate = {
  url: string;
  /** direct = a media file or manifest; embed = a player page worth handing to yt-dlp. */
  type: "direct" | "manifest" | "embed";
  source: string;
};

const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|svg|avif|ico)(\?|#|$)/i;
const DIRECT_RE = /\.(mp4|m4v|webm|mov|mkv|m4a|mp3|aac|ogg|oga|opus|wav|flac)(\?|#|$)/i;
const MANIFEST_RE = /\.(m3u8|mpd)(\?|#|$)/i;
const EMBED_HINT_RE = /(embed|player|\/video|\/videos\/|\/watch|\/v\/|iframe|jwplayer|brightcove|vimeo|youtube|youtu\.be|dailymotion|streamable|wistia|vidyard|kaltura|jwp|ooyala)/i;

function decodeHtml(s: string): string {
  return s
    .split("&" + "amp;").join("&")
    .split("&" + "quot;").join('"')
    .split("&" + "#x2F;").join("/")
    .split("&" + "#47;").join("/");
}

function unescapeJson(s: string): string {
  return s
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003[dD]/g, "=")
    .replace(/\\\//g, "/");
}

function absolutize(raw: string, base: string): string | null {
  const cleaned = unescapeJson(decodeHtml(raw.trim())).replace(/[\\"'<>]+$/g, "");
  if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("blob:") || cleaned.startsWith("javascript:")) return null;
  try {
    const u = new URL(cleaned.startsWith("//") ? `https:${cleaned}` : cleaned, base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function metaContents(html: string, prop: string): string[] {
  const out: string[] = [];
  const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${esc}["'][^>]*content=["']([^"']+)["']`, "gi");
  const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${esc}["']`, "gi");
  for (const re of [a, b]) for (const m of html.matchAll(re)) if (m[1]) out.push(m[1]);
  return out;
}

function classify(url: string, hint: MediaCandidate["type"]): MediaCandidate["type"] | null {
  if (IMAGE_RE.test(url)) return null;
  if (MANIFEST_RE.test(url)) return "manifest";
  if (DIRECT_RE.test(url)) return "direct";
  return hint;
}

/** schema.org VideoObject fields, wherever they appear (JSON-LD, inline JSON, microdata). */
function jsonLdVideos(html: string): Array<{ url: string; key: string }> {
  const out: Array<{ url: string; key: string }> = [];
  for (const k of html.matchAll(/"(contentUrl|embedUrl)"\s*:\s*"([^"]+)"/gi)) {
    if (k[2]) out.push({ key: k[1]!, url: k[2] });
  }
  return out;
}

/** oEmbed discovery links (<link rel="alternate" type="application/json+oembed">). */
export function oembedLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/json\+oembed/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    const abs = href ? absolutize(href, baseUrl) : null;
    if (abs) out.push(abs);
  }
  return [...new Set(out)].slice(0, 2);
}

/** iframe src inside an oEmbed JSON "html" field. */
export function iframeFromOembed(json: unknown, baseUrl: string): string | null {
  if (!json || typeof json !== "object") return null;
  const html = (json as { html?: unknown }).html;
  if (typeof html !== "string") return null;
  const src = html.match(/<iframe\b[^>]*\ssrc=["']([^"']+)["']/i)?.[1];
  return src ? absolutize(src, baseUrl) : null;
}

/** Ranked, de-duplicated candidates. Direct files first, then manifests, then embeds. */
export function pageMediaCandidates(html: string, baseUrl: string, limit = 12): MediaCandidate[] {
  const found: MediaCandidate[] = [];
  const push = (raw: string | undefined, hint: MediaCandidate["type"], source: string) => {
    if (!raw) return;
    const abs = absolutize(raw, baseUrl);
    if (!abs || abs === baseUrl) return;
    const type = classify(abs, hint);
    if (!type) return;
    found.push({ url: abs, type, source });
  };

  for (const p of ["og:video:secure_url", "og:video:url", "og:video", "twitter:player:stream", "contentUrl"]) {
    for (const v of metaContents(html, p)) push(v, "embed", p);
  }
  for (const m of html.matchAll(/<(?:video|source|audio)\b[^>]*?\s(?:src|data-src)=["']([^"']+)["']/gi)) push(m[1], "direct", "video-tag");
  for (const v of jsonLdVideos(html)) push(v.url, v.key === "contentUrl" ? "direct" : "embed", `ld:${v.key}`);
  for (const p of ["twitter:player", "embedUrl"]) for (const v of metaContents(html, p)) push(v, "embed", p);
  for (const m of html.matchAll(/<iframe\b[^>]*?\s(?:src|data-src)=["']([^"']+)["']/gi)) {
    if (m[1] && EMBED_HINT_RE.test(m[1])) push(m[1], "embed", "iframe");
  }
  // Player/embed URLs mentioned in scripts (any host).
  let embeds = 0;
  for (const m of unescapeJson(html).matchAll(/https?:\/\/[^\s"'<>()\\]*(?:\/embed\/|\/player\/|\/\/player\.)[^\s"'<>()\\]*/gi)) {
    if (embeds >= 3) break;
    if (/\.(js|css)(\?|$)/i.test(m[0])) continue;
    push(m[0], "embed", "script-embed");
    embeds += 1;
  }
  // Raw strings inside inline scripts / JSON blobs (escaped or not).
  const text = unescapeJson(html);
  for (const m of text.matchAll(/(?:https?:)?\/\/[^\s"'<>()\\]+?\.(?:m3u8|mpd|mp4|webm|mov|m4v)(?:\?[^\s"'<>()\\]*)?(?=["'\s<>()\\]|$)/gi)) {
    push(m[0], "direct", "script");
  }

  const rank = (c: MediaCandidate) => (c.type === "direct" ? 0 : c.type === "manifest" ? 1 : 2);
  const seen = new Set<string>();
  const unique: MediaCandidate[] = [];
  for (const c of found.sort((a, b) => rank(a) - rank(b))) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    unique.push(c);
  }
  return unique.slice(0, limit);
}

/** Every absolute URL-ish string in the page, for AI selection when the standards are silent. */
export function pageUrlPool(html: string, baseUrl: string, limit = 150): string[] {
  const text = unescapeJson(html);
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:src|href|data-[a-z-]+|content|url|file|source|stream|hls|dash|mp4)\s*[=:]\s*["']([^"'<>\s]{8,600})["']/gi)) {
    const abs = absolutize(m[1] ?? "", baseUrl);
    if (!abs || IMAGE_RE.test(abs) || /\.(css|js|woff2?|ttf|json)(\?|$)/i.test(abs)) continue;
    out.add(abs);
    if (out.size >= limit) break;
  }
  return [...out];
}

export function pageTitle(html: string): string | undefined {
  const og = metaContents(html, "og:title")[0] ?? metaContents(html, "twitter:title")[0];
  if (og) return decodeHtml(og).slice(0, 200);
  const t = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1];
  return t ? decodeHtml(t).trim().slice(0, 200) : undefined;
}
