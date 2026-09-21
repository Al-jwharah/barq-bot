import { createFileRoute } from "@tanstack/react-router";
import { extractMedia } from "@/lib/media/extract";

export const Route = createFileRoute("/api/resolve")({
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
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "فشل التحميل";
          return Response.json({ error: message }, { status: 422 });
        }
      },
    },
  },
});
