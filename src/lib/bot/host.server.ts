import { randomBytes } from "node:crypto";
import { TELEGRAM_BOT_TOKEN } from "./config.server";
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

export async function hostTelegramFile(input: {
  fileId: string;
  kind: HostKind;
  fileName?: string;
  mime?: string;
  tgId: number;
}): Promise<{ id: string; mediaUrl: string; expiresAt: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error("التخزين غير جاهز");
  const file = await telegram.getFile(input.fileId);
  if (!file.file_path) throw new Error("تعذر قراءة الملف");
  if ((file.file_size ?? 0) > 20 * 1024 * 1024) {
    throw new Error("الحد 20 ميغابايت (قيود تيليجرام للبوت)");
  }
  const res = await fetch(
    `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`,
  );
  if (!res.ok) throw new Error("تعذر تنزيل الملف من تليجرام");
  const blob = await res.blob();
  const name = (input.fileName || file.file_path.split("/").pop() || "file").replace(
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
  const clip = await createClipLink({
    tgId: input.tgId,
    url: `clip:${pathname}`,
    kind: input.kind,
    platform: "upload",
    storageKey: pathname,
    maxHits: 200,
  });
  return { id: clip.id, mediaUrl: "", expiresAt: clip.expiresAt };
}
