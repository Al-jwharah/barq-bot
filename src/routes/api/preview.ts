import { createFileRoute } from "@tanstack/react-router";
import { extractMedia } from "@/lib/media/extract";
import { toLinkPreview } from "@/lib/media/preview";
import { BOT_USERNAME } from "@/lib/bot/config.server";

/**
 * D2 — Live link preview (thumbnail / duration / platform / size estimate)
 * before sending to the bot. Reuses extractMedia safely (same SSRF guards).
 */
export const Route = createFileRoute("/api/preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let url = "";
        try {
          const body = (await request.json()) as { url?: string };
          url = (body.url ?? "").trim();
        } catch {
          return Response.json({ error: "bad json" }, { status: 400 });
        }
        if (url.length < 8) {
          return Response.json({ error: "أدخل رابط صحيح" }, { status: 400 });
        }
        try {
          const result = await extractMedia(url);
          const preview = toLinkPreview(result, BOT_USERNAME);
          return Response.json(
            { ok: true, preview, result },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "فشل المعاينة";
          return Response.json({ ok: false, error: message }, { status: 422 });
        }
      },
    },
  },
});
