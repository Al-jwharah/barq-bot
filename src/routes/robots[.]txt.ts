import { createFileRoute } from "@tanstack/react-router";
import { getPublicOrigin } from "@/lib/bot/origin";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const origin = getPublicOrigin();
        const sitemap = origin ? `${origin}/sitemap.xml` : "";
        const body = sitemap
          ? `User-agent: *\nAllow: /\nSitemap: ${sitemap}\n`
          : "User-agent: *\nAllow: /\n";
        return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
      },
    },
  },
});
