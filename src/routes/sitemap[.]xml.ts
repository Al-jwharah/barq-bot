import { createFileRoute } from "@tanstack/react-router";

const PATHS = ["/", "/tiktok", "/instagram", "/youtube", "/x", "/facebook", "/snapchat", "/faq", "/legal"];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls = PATHS.map(
          (p) => `  <url><loc>https://abdulrhman.ai${p === "/" ? "" : p}</loc></url>`,
        ).join("\n");
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
        return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8" } });
      },
    },
  },
});
