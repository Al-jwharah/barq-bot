import { createFileRoute } from "@tanstack/react-router";
import { createClipLink } from "@/lib/bot/store.server";
import { extractMedia } from "@/lib/media/extract";
import { fileIdentity } from "@/lib/media/file-kind";

export const Route = createFileRoute("/api/grab")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const src = new URL(request.url).searchParams.get("src")?.trim() || "";
        if (!/^https?:\/\//i.test(src) || src.length > 2000) {
          return new Response("رابط غير صالح", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
        }
        const result = await extractMedia(src).catch(() => null);
        const item = result?.items.find((i) => i.kind !== "photo") || result?.items[0];
        const variant = [...(item?.variants ?? [])].sort(
          (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.size ?? 0) - (a.size ?? 0),
        )[0];
        const media = variant?.url || item?.url;
        if (!result || !media) {
          return new Response("ما لقيت ملفًا لهذا الرابط", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        const idn = fileIdentity({
          kind: item?.kind,
          url: media,
          contentType: variant?.contentType,
          duration: item?.duration,
        });
        const made = await createClipLink({
          tgId: 0,
          url: result.sourceUrl || src,
          mediaUrl: media,
          thumbnail: item?.thumbnail,
          kind: item?.kind || idn.label,
          platform: result.platform,
        });
        return Response.redirect(new URL(`/dl/${made.id}`, request.url), 302);
      },
    },
  },
});
