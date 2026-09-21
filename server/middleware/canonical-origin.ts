import { getPublicOrigin, publicUrl, shouldCanonicalRedirect } from "../../src/lib/bot/origin";

interface OriginEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

export default async function canonicalOriginMiddleware(
  event: OriginEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  const path = event.url.pathname;
  const origin = getPublicOrigin();

  if ((method === "GET" || method === "HEAD") && path === "/robots.txt") {
    const sitemap = origin ? `Sitemap: ${publicUrl("/sitemap.xml")}\n` : "";
    return new Response(`User-agent: *\nAllow: /\n${sitemap}`, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  if ((method === "GET" || method === "HEAD") && path === "/sitemap.xml") {
    if (!origin) return new Response("BARQ_PUBLIC_ORIGIN missing", { status: 503 });
    const urls = ["/", "/admin"].map((p) => publicUrl(p));
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((loc) => `  <url><loc>${loc}</loc></url>`).join("\n")}
</urlset>
`;
    return new Response(body, {
      headers: { "content-type": "application/xml; charset=utf-8" },
    });
  }

  if (!origin) return next();
  const host = (
    event.req.headers.get("x-forwarded-host") ??
    event.req.headers.get("host") ??
    event.url.host
  )
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  const target = shouldCanonicalRedirect(host ?? "", origin);
  if (!target) return next();
  if (method !== "GET" && method !== "HEAD") return next();
  return new Response(null, {
    status: 308,
    headers: { location: `${target}${event.url.pathname}${event.url.search}` },
  });
}
