import { createFileRoute } from "@tanstack/react-router";
import { jobSecret } from "@/lib/bot/config.server";
import { extractMedia } from "@/lib/media/extract";
import { assertSafeOutboundUrl } from "@/lib/media/ssrf";

function authorized(request: Request): boolean {
  const want = jobSecret();
  const hdr = request.headers.get("x-barq-job") ?? "";
  const q = new URL(request.url).searchParams.get("secret") ?? "";
  return Boolean(want) && (hdr === want || q === want);
}

export const Route = createFileRoute("/api/partner")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "partner";
        const { takeRate } = await import("@/lib/bot/rate-limit.server");
        const paced = await takeRate(`partner:${ip}`, "webhook");
        if (!paced.ok) {
          return Response.json({ error: "rate_limited", retryAfter: paced.retryAfter }, { status: 429 });
        }
        let url = "";
        try {
          const body = (await request.json()) as { url?: string };
          url = String(body.url ?? "").trim();
        } catch {
          return Response.json({ error: "bad json" }, { status: 400 });
        }
        if (!url) return Response.json({ error: "url required" }, { status: 400 });
        try {
          await assertSafeOutboundUrl(url);
          const { assertSafeMedia } = await import("@/lib/bot/handle.server");
          await assertSafeMedia(url);
          const result = await extractMedia(url);
          await assertSafeMedia(url, result);
          return Response.json({
            ok: true,
            platform: result.platform,
            title: result.title ?? null,
            items: result.items.map((i) => ({ kind: i.kind, url: i.url, quality: i.variants[0]?.quality })),
          });
        } catch (err) {
          return Response.json({ ok: false, error: err instanceof Error ? err.message.slice(0, 180) : "failed" }, { status: 422 });
        }
      },
    },
  },
});
