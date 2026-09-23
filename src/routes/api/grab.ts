import { createFileRoute } from "@tanstack/react-router";
import { extractMedia } from "@/lib/media/extract";
import { attachmentDisposition, fileIdentity } from "@/lib/media/file-kind";
import { mediaHeaders } from "@/lib/media/http";
import { assertSafeOutboundUrl } from "@/lib/media/ssrf";
import type { ExtractResult } from "@/lib/media/types";

export const Route = createFileRoute("/api/grab")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const src = new URL(request.url).searchParams.get("src")?.trim() || "";
        if (!/^https?:\/\//i.test(src) || src.length > 2000) return fail("الرابط غير صالح.");
        try {
          const result = await extractMedia(src);
          const picked = pick(result);
          if (!picked) return fail("ما لقيت ملفًا لهذا الرابط.");
          await assertSafeOutboundUrl(picked.url);
          const idn = fileIdentity(picked);
          const upstream = await fetch(picked.url, {
            headers: mediaHeaders(undefined, picked.url),
            redirect: "follow",
          });
          if (!upstream.ok || !upstream.body) return Response.redirect(picked.url, 302);
          const headers = new Headers();
          headers.set("Content-Type", idn.mime);
          headers.set("Content-Disposition", attachmentDisposition(result.title || idn.label, idn.ext));
          headers.set("X-Content-Type-Options", "nosniff");
          headers.set("Cache-Control", "private, no-store");
          const len = upstream.headers.get("content-length");
          if (len) headers.set("Content-Length", len);
          return new Response(upstream.body, { status: 200, headers });
        } catch {
          return fail("تعذر تجهيز الملف. ارجع للموقع وأعد المحاولة.");
        }
      },
    },
  },
});

function pick(result: ExtractResult) {
  const item = result.items.find((i) => i.kind !== "photo") || result.items[0];
  const variant = [...(item?.variants ?? [])].sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.size ?? 0) - (a.size ?? 0),
  )[0];
  const url = variant?.url || item?.url;
  if (!url) return null;
  return {
    url,
    kind: item?.kind,
    contentType: variant?.contentType,
    duration: item?.duration,
    title: result.title,
  };
}

function fail(message: string) {
  const body = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>برق</title><body style="font-family:sans-serif;background:#07070a;color:#fff;padding:32px"><p>${message}</p><p><a href="https://abdulrhman.ai" style="color:#e8c547">العودة للموقع</a></p></body></html>`;
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}
