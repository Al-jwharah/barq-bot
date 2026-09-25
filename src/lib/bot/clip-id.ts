export const CLIP_ID_BYTES = 32;
export const CLIP_TTL_MS = 24 * 60 * 60 * 1000;

function base64urlBytes(raw: string): number {
  const rem = raw.length % 4;
  return Math.floor(raw.length / 4) * 3 + (rem === 0 ? 0 : rem - 1);
}

export function isClipId(raw: string): boolean {
  if (typeof raw !== "string") return false;
  if (raw.includes("\0") || raw.includes("%") || raw.includes(".") || raw.includes("/") || raw.includes("\\")) {
    return false;
  }
  if (!/^[A-Za-z0-9_-]{43,64}$/.test(raw)) return false;
  if (/^\d+$/.test(raw)) return false;
  return base64urlBytes(raw) >= CLIP_ID_BYTES;
}

export type ClipAccess = {
  expires_at?: string | null;
  revoked_at?: string | null;
  hits?: number | null;
  max_hits?: number | null;
  storage_key?: string | null;
};

export type ClipDenied = "unknown" | "expired" | "revoked" | "exhausted";

export function clipDeniedReason(clip: ClipAccess | null | undefined, now = Date.now()): ClipDenied | null {
  if (!clip) return "unknown";
  if (clip.revoked_at) return "revoked";
  if (!clip.expires_at) return "expired";
  const t = Date.parse(String(clip.expires_at));
  if (!Number.isFinite(t) || t <= now) return "expired";
  if (clip.max_hits != null && Number(clip.hits ?? 0) >= Number(clip.max_hits)) return "exhausted";
  return null;
}

/** Same 404 for expired / revoked / unknown — do not leak existence or storage_key. */
export function clipServeStatus(id: string, clip: ClipAccess | null | undefined, now = Date.now()): 200 | 404 {
  if (!isClipId(id)) return 404;
  if (clipDeniedReason(clip, now)) return 404;
  return 200;
}

export function clipExpiresAt(now = Date.now()): string {
  return new Date(now + CLIP_TTL_MS).toISOString();
}

export function toPublicClip(clip: {
  id: string;
  kind?: string | null;
  platform?: string | null;
  expires_at?: string | null;
  thumbnail?: string | null;
  storage_key?: string | null;
  media_url?: string | null;
}): {
  id: string;
  kind: string;
  platform: string | null;
  expiresAt: string | null;
  thumbnail: string | null;
} {
  return {
    id: clip.id,
    kind: clip.kind ?? "video",
    platform: clip.platform ?? null,
    expiresAt: clip.expires_at ?? null,
    thumbnail: clip.thumbnail && !/blob\.vercel/i.test(clip.thumbnail) ? clip.thumbnail : null,
  };
}
