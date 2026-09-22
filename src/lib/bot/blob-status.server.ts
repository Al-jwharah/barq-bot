/** Detect Vercel Blob store outages without printing tokens. */

export const TGFILE_PREFIX = "tgfile/";

export function isBlobStoreUnavailable(err: unknown): boolean {
  if (!err) return false;
  const name = typeof err === "object" && err && "name" in err ? String((err as { name?: string }).name) : "";
  const msg = err instanceof Error ? err.message : String(err);
  if (/BlobStoreSuspendedError|BlobStoreNotFoundError|BlobAccessError/i.test(name)) return true;
  return /store has been suspended|store does not exist|access denied|not entitled|billing/i.test(msg);
}

export function blobTokenPresent(): boolean {
  return Boolean(typeof process !== "undefined" && process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/**
 * True only if token exists AND a cheap list() succeeds.
 * Suspended / wrong-token stores return false (health must not say storage ok).
 */
export async function probeBlobStoreOk(): Promise<boolean> {
  const token = typeof process !== "undefined" ? process.env.BLOB_READ_WRITE_TOKEN?.trim() : "";
  if (!token) return false;
  try {
    // list() can still succeed on a billing-suspended store; put() is the real signal.
    const { put, del } = await import("@vercel/blob");
    const pathname = "barq-health/probe";
    await put(pathname, "ok", {
      access: "private",
      token,
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "text/plain",
    });
    await del(pathname, { token }).catch(() => undefined);
    return true;
  } catch (err) {
    if (isBlobStoreUnavailable(err)) return false;
    console.warn("[blob] probe failed:", err instanceof Error ? err.message : "error");
    return false;
  }
}

export function isTgFileStorageKey(key: string | null | undefined): boolean {
  return Boolean(key && key.startsWith(TGFILE_PREFIX) && key.length > TGFILE_PREFIX.length);
}

export function tgFileIdFromStorageKey(key: string): string | null {
  if (!isTgFileStorageKey(key)) return null;
  const id = key.slice(TGFILE_PREFIX.length);
  // Telegram file_id is opaque; reject path tricks only.
  if (!id || id.includes("/") || id.includes("..") || id.includes("\\")) return null;
  return id;
}

export function tgFileStorageKey(fileId: string): string {
  return `${TGFILE_PREFIX}${fileId}`;
}

/** User-facing Arabic when Blob cannot host uploads and Telegram fallback also fails. */
export const BLOB_SUSPENDED_AR =
  "تخزين الملفات متوقف مؤقتًا (Vercel Blob معلّق). جرّب لاحقًا أو الصق رابط فيديو للتحميل.";
