import { SHORT_LINKS_UI } from "./config.server";
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
 * True only if token exists AND a put/del probe succeeds.
 * Suspended stores can still list() — put() is definitive.
 */
export async function probeBlobStoreOk(): Promise<boolean> {
  const token = typeof process !== "undefined" ? process.env.BLOB_READ_WRITE_TOKEN?.trim() : "";
  if (!token) return false;
  try {
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
    if (isBlobStoreUnavailable(err)) {
      markBlobSuspended();
      return false;
    }
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
  if (!id || id.includes("/") || id.includes("..") || id.includes("\\")) return null;
  return id;
}

export function tgFileStorageKey(fileId: string): string {
  return `${TGFILE_PREFIX}${fileId}`;
}

/** User-facing Arabic when Blob cannot host uploads. */
export const BLOB_SUSPENDED_AR =
  "تخزين الملفات متوقف مؤقتًا (Vercel Blob معلّق). جرّب لاحقًا أو الصق رابط فيديو للتحميل.";

export const SHORT_LINK_HIDDEN_AR =
  "الرابط المختصر متوقف مؤقتًا (التخزين السحابي معلّق).\nحمّل من رابط المنصة كالمعتاد — نعيد تفعيله بعد إصلاح التخزين.";

export const SHORT_LINK_OK_HINT_AR =
  "أرسل الآن صورة أو فيديو أو ملفًا (حد 20 ميغابايت) لأصدر لك رابطًا مباشرًا 24 ساعة.\nأو بعد أي تحميل ناجح اضغط «رابط مختصر».";

let suspendedFlag = false;
export function markBlobSuspended(): void {
  suspendedFlag = true;
}
export function clearBlobSuspendedForTests(): void {
  suspendedFlag = false;
}
export function isBlobMarkedSuspended(): boolean {
  return suspendedFlag;
}

/** Upload-based short links need a live Blob token and no suspension mark. */
export function blobUploadReady(): boolean {
  return blobTokenPresent() && !suspendedFlag;
}

/**
 * Advertise short-link CTAs when upload backend is ready.
 * Clip-based short links still work via tgfile fallback even if this is false —
 * handlers should prefer lastClip before refusing.
 */
export function shortLinksAdvertised(): boolean {
  return SHORT_LINKS_UI && blobUploadReady();
}
