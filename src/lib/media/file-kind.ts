export type FileIdentity = {
  ext: string;
  mime: string;
  label: string;
};

export function fileIdentity(input: {
  kind?: string | null;
  url?: string | null;
  contentType?: string | null;
  duration?: number | null;
}): FileIdentity {
  const path = pathOf(input.url);
  const ct = (input.contentType || "").toLowerCase();
  if (path.endsWith(".apk") || ct.includes("android.package")) {
    return { ext: "apk", mime: "application/vnd.android.package-archive", label: "تطبيق" };
  }
  if (path.endsWith(".ipa")) return { ext: "ipa", mime: "application/octet-stream", label: "تطبيق" };
  if (path.endsWith(".exe")) return { ext: "exe", mime: "application/octet-stream", label: "تطبيق" };
  if (path.endsWith(".msi")) return { ext: "msi", mime: "application/octet-stream", label: "تطبيق" };
  if (path.endsWith(".zip")) return { ext: "zip", mime: "application/zip", label: "ملف" };
  if (input.kind === "audio" || ct.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|flac)$/.test(path)) {
    const ext = path.match(/\.(mp3|m4a|aac|wav|ogg|flac)$/)?.[1] || (ct.includes("mpeg") ? "mp3" : "m4a");
    const mime =
      ext === "mp3" ? "audio/mpeg" : ext === "wav" ? "audio/wav" : ext === "ogg" ? "audio/ogg" : "audio/mp4";
    return { ext, mime, label: "أغنية" };
  }
  if (input.kind === "photo" || ct.startsWith("image/")) {
    const ext = path.endsWith(".png") ? "png" : path.endsWith(".webp") ? "webp" : "jpg";
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { ext, mime, label: "صورة" };
  }
  const long = (input.duration ?? 0) >= 20 * 60;
  return { ext: "mp4", mime: "video/mp4", label: long ? "فلم" : "فيديو" };
}

export function attachmentDisposition(name: string, ext: string): string {
  const base = safeTitle(name);
  const utf = `${base}.${ext}`;
  const ascii = `${base.replace(/[^\w .-]+/g, "").trim() || "barq"}.${ext}`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf)}`;
}

function pathOf(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function safeTitle(name: string): string {
  const clean = name.replace(/[^\w\u0600-\u06FF .-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 48);
  return clean || "barq";
}
