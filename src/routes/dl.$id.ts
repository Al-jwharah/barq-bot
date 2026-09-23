import { createFileRoute } from "@tanstack/react-router";
import { isClipId } from "@/lib/bot/clip-id";
import { clipNotFoundResponse } from "@/lib/bot/clip-serve.server";
import { getClipLink } from "@/lib/bot/store.server";
import { attachmentDisposition, fileIdentity } from "@/lib/media/file-kind";
import { mediaHeaders } from "@/lib/media/http";
import { assertSafeOutboundUrl } from "@/lib/media/ssrf";

export const Route = createFileRoute("/dl/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const fromParams = typeof params.id === "string" ? params.id : "";
          const fromPath = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
          const id = fromParams || fromPath;
          if (!isClipId(id)) return clipNotFoundResponse();
          const clip = await getClipLink(id).catch(() => null);
          if (!clip) return clipNotFoundResponse();
          const picked = await pickFile(clip.media_url, clip.url, clip.kind);
          if (!picked) return clipNotFoundResponse();
          try {
            await assertSafeOutboundUrl(picked.url);
          } catch {
            return clipNotFoundResponse();
          }
          const idn = fileIdentity(picked);
          const res = await fetch(picked.url, { headers: mediaHeaders(undefined, picked.url), redirect: "follow" }).catch(
            () => null,
          );
          if (!res?.ok || !res.body) return Response.redirect(picked.url, 302);
          const len = Number(res.headers.get("content-length") || 0);
          if (!len || len > 8 * 1024 * 1024) return Response.redirect(picked.url, 302);
          const headers = new Headers();
          headers.set("Content-Type", idn.mime);
          headers.set("Content-Disposition", attachmentDisposition(picked.title || idn.label, idn.ext));
          headers.set("X-Content-Type-Options", "nosniff");
          headers.set("Cache-Control", "private, no-store");
          headers.set("Content-Length", String(len));
          return new Response(res.body, { status: 200, headers });
        } catch {
          return new Response("تعذر تحميل الملف. ارجع إلى abdulrhman.ai", {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
      },
    },
  },
});

async function pickFile(mediaUrl: string | null, sourceUrl: string, kind: string | null) {
  if (mediaUrl && /^https?:\/\//i.test(mediaUrl)) {
    return { url: mediaUrl, kind, title: kind || "barq", duration: 0, contentType: "" };
  }
  if (!/^https?:\/\//i.test(sourceUrl)) return null;
  const { extractMedia } = await import("@/lib/media/extract");
  const result = await extractMedia(sourceUrl).catch(() => null);
  const item = result?.items.find((i) => i.kind !== "photo") || result?.items[0];
  const variant = [...(item?.variants ?? [])].sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.size ?? 0) - (a.size ?? 0),
  )[0];
  const url = variant?.url || item?.url;
  if (!url) return null;
  return {
    url,
    kind: item?.kind || kind,
    title: result?.title || item?.kind || "barq",
    duration: item?.duration ?? 0,
    contentType: variant?.contentType || "",
  };
}
