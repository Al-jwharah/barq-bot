import { randomBytes } from "node:crypto";
import { TELEGRAM_BOT_TOKEN } from "./config.server";
import {
  BLOB_SUSPENDED_AR,
  isBlobMarkedSuspended,
  isBlobStoreUnavailable,
  markBlobSuspended,
  tgFileStorageKey,
} from "./blob-status.server";
import { createClipLink } from "./store.server";
import { telegram, type TgMessage } from "./telegram.server";

export type HostKind = "video" | "photo" | "file" | "app";

export function fileFromMessage(msg: TgMessage): {
  fileId: string;
  kind: HostKind;
  fileName?: string;
  mime?: string;
} | null {
  if (msg.video?.file_id) {
    return { fileId: msg.video.file_id, kind: "video", fileName: "video.mp4", mime: "video/mp4" };
  }
  if (msg.video_note?.file_id) {
    return { fileId: msg.video_note.file_id, kind: "video", fileName: "note.mp4", mime: "video/mp4" };
  }
  if (msg.animation?.file_id) {
    return { fileId: msg.animation.file_id, kind: "video", fileName: "clip.mp4", mime: "video/mp4" };
  }
  if (msg.audio?.file_id) {
    return {
      fileId: msg.audio.file_id,
      kind: "file",
      fileName: msg.audio.file_name || "audio.mp3",
      mime: msg.audio.mime_type || "audio/mpeg",
    };
  }
  if (msg.voice?.file_id) {
    return { fileId: msg.voice.file_id, kind: "file", fileName: "voice.ogg", mime: msg.voice.mime_type || "audio/ogg" };
  }
  if (msg.photo?.length) {
    const p = msg.photo[msg.photo.length - 1]!;
    return { fileId: p.file_id, kind: "photo", fileName: "photo.jpg", mime: "image/jpeg" };
  }
  if (msg.document?.file_id) {
    const name = (msg.document.file_name || "file").toLowerCase();
    const mime = msg.document.mime_type || "";
    const isApp = /\.(ipa|apk|dmg|exe|app|pkg)$/i.test(name) || mime.includes("ipa") || mime.includes("android");
    const kind: HostKind = isApp
      ? "app"
      : mime.startsWith("video/")
        ? "video"
        : mime.startsWith("image/")
          ? "photo"
          : "file";
    return {
      fileId: msg.document.file_id,
      kind,
      fileName: msg.document.file_name || "file",
      mime: mime || (isApp ? "application/octet-stream" : "application/octet-stream"),
    };
  }
  if (msg.sticker?.file_id) {
    return { fileId: msg.sticker.file_id, kind: "photo", fileName: "sticker.webp", mime: "image/webp" };
  }
  return null;
}

async function putHostBlob(input: {
  fileId: string;
  fileName?: string;
  mime?: string;
  tgId: number;
  filePath: string;
}): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error("no blob token");
  const res = await fetch(
    `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${input.filePath}`,
  );
  if (!res.ok) throw new Error("تعذر تنزيل الملف من تليجرام");
  const blob = await res.blob();
  const name = (input.fileName || input.filePath.split("/").pop() || "file").replace(
    /[^\w.-]+/g,
    "_",
  );
  const { put } = await import("@vercel/blob");
  const pathname = `host/${input.tgId}/${randomBytes(16).toString("hex")}-${name}`;
  await put(pathname, blob, {
    access: "private",
    token,
    addRandomSuffix: false,
    contentType: input.mime || blob.type || "application/octet-stream",
  });
  return pathname;
}

/**
 * Host a Telegram file for a 24h short link.
 * Prefer Vercel Blob; if the store is suspended/missing, fall back to
 * Telegram file_id (resolved via getFile on each /d download — no new secret).
 */
export async function hostTelegramFile(input: {
  fileId: string;
  kind: HostKind;
  fileName?: string;
  mime?: string;
  tgId: number;
  hours?: 12 | 24;
}): Promise<{ id: string; mediaUrl: string; expiresAt: string; backend: "blob" | "telegram" }> {
  const file = await telegram.getFile(input.fileId);
  if (!file.file_path) throw new Error("تعذر قراءة الملف");
  if ((file.file_size ?? 0) > 20 * 1024 * 1024) {
    throw new Error("الحد 20 ميغابايت (قيود تيليجرام للبوت)");
  }

  let storageKey: string | null = null;
  let backend: "blob" | "telegram" = "telegram";

  // Skip Blob entirely once this instance saw the store suspended (saves a full re-download).
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim() && !isBlobMarkedSuspended()) {
    try {
      storageKey = await putHostBlob({
        fileId: input.fileId,
        fileName: input.fileName,
        mime: input.mime,
        tgId: input.tgId,
        filePath: file.file_path,
      });
      backend = "blob";
    } catch (err) {
      // Any Blob failure (suspended, quota, network) falls back to the Telegram
      // file_id link, which streams from Telegram on each open.
      if (isBlobStoreUnavailable(err)) markBlobSuspended();
      console.warn("[host] Blob unavailable — using Telegram file_id fallback");
      storageKey = null;
    }
  }

  if (!storageKey) {
    if (!input.fileId) throw new Error(BLOB_SUSPENDED_AR);
    storageKey = tgFileStorageKey(input.fileId);
    backend = "telegram";
  }

  const { dropTtlMs } = await import("./drop.server");
  const clip = await createClipLink({
    tgId: input.tgId,
    url: `clip:${storageKey}`,
    kind: input.kind,
    platform: "upload",
    storageKey,
    maxHits: 200,
    ttlMs: input.hours ? dropTtlMs(input.hours) : undefined,
  });
  return { id: clip.id, mediaUrl: "", expiresAt: clip.expiresAt, backend };
}
