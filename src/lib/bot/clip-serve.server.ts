import { consumeClip, getClipLink } from "./store.server";
import { clipDeniedReason, isClipId } from "./clip-id";
import { isHostedMediaCdn, mediaHeaders } from "../media/http";
import { assertSafeOutboundUrl } from "../media/ssrf";

export const CLIP_NOT_FOUND_BODY = "Not Found";

/** Identical 404 for unknown, expired, and revoked clips. Body never includes storage_key. */
export function clipNotFoundResponse(): Response {
  return new Response(CLIP_NOT_FOUND_BODY, {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function isBlobStorageUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".blob.vercel-storage.com") || host.includes("blob.vercel");
  } catch {
    return url.startsWith("host/");
  }
}

async function streamBlob(key: string, request: Request, access: "public" | "private"): Promise<Response> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return clipNotFoundResponse();
  const { get } = await import("@vercel/blob");
  const range = request.headers.get("range");
  const result = await get(key, {
    access,
    token,
    headers: range ? { Range: range } : undefined,
  });
  if (!result || result.statusCode !== 200 || !result.stream) return clipNotFoundResponse();
  const out = new Headers();
  out.set("Content-Type", result.blob.contentType || "application/octet-stream");
  out.set("Cache-Control", "private, max-age=60");
  out.set("X-Content-Type-Options", "nosniff");
  if (result.blob.size) out.set("Content-Length", String(result.blob.size));
  return new Response(result.stream, { status: range ? 206 : 200, headers: out });
}

export async function serveClipById(id: string, request: Request): Promise<Response> {
  if (!isClipId(id)) return clipNotFoundResponse();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "clip";
  const { rateLimitClip } = await import("./rate-limit.server");
  const paced = await rateLimitClip(ip);
  if (!paced.ok) {
    return new Response("too many requests", {
      status: 429,
      headers: { "retry-after": String(paced.retryAfter), "cache-control": "no-store" },
    });
  }
  const range = request.headers.get("range");
  const firstByte = !range || /^bytes=0-/i.test(range);
  const clip = firstByte ? await consumeClip(id).catch(() => null) : await getClipLink(id).catch(() => null);
  if (!clip || clipDeniedReason(clip)) return clipNotFoundResponse();
  const storageKey = clip.storage_key;
  if (storageKey) return streamBlob(storageKey, request, "private");
  if (clip.media_url && isBlobStorageUrl(clip.media_url)) {
    return streamBlob(clip.media_url, request, "public");
  }
  if (clip.media_url && /^https?:\/\//i.test(clip.media_url)) {
    return proxySourceMedia(clip.media_url, request);
  }
  return clipNotFoundResponse();
}

async function proxySourceMedia(url: string, request: Request): Promise<Response> {
  try {
    await assertSafeOutboundUrl(url);
  } catch {
    return clipNotFoundResponse();
  }
  if (!isHostedMediaCdn(url)) return clipNotFoundResponse();
  const range = request.headers.get("range");
  const extra = range ? { Range: range } : undefined;
  const res = await fetch(url, { headers: mediaHeaders(extra, url) });
  if (!res.ok && res.status !== 206) return clipNotFoundResponse();
  const out = new Headers();
  out.set("Content-Type", res.headers.get("content-type") || "video/mp4");
  out.set("Cache-Control", "private, max-age=120");
  out.set("X-Content-Type-Options", "nosniff");
  out.set("Accept-Ranges", "bytes");
  const cl = res.headers.get("content-length");
  if (cl) out.set("Content-Length", cl);
  const cr = res.headers.get("content-range");
  if (cr) out.set("Content-Range", cr);
  return new Response(res.body, { status: res.status, headers: out });
}
