import { createFileRoute } from "@tanstack/react-router";
import { getPublicOrigin } from "@/lib/bot/origin";

const PATHS = ["/", "/tiktok", "/instagram", "/youtube", "/x", "/facebook", "/snapchat", "/faq", "/legal", "/privacy", "/terms", "/account", "/workspace"];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const origin = getPublicOrigin();
        if (!origin) return new Response("BARQ_PUBLIC_ORIGIN missing", { status: 503 });
        const urls = PATHS.map((p) => `  <url><loc>${origin}${p === "/" ? "" : p}</loc></url>`).join("\n");
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
        return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8" } });
      },
    },
  },
});
