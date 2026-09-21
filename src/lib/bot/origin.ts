/** Single public origin from BARQ_PUBLIC_ORIGIN. Never hardcode production hosts. */

export function normalizeOrigin(raw?: string | null): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (u.hostname.toLowerCase().startsWith("www.")) {
      u.hostname = u.hostname.slice(4);
    }
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

function envOrigin(): string {
  if (typeof process === "undefined") return "";
  return normalizeOrigin(process.env.BARQ_PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN);
}

/** Public site origin from BARQ_PUBLIC_ORIGIN only. Empty if unset. */
export function getPublicOrigin(): string {
  return envOrigin();
}

export function requirePublicOrigin(): string {
  const origin = envOrigin();
  if (!origin) throw new Error("BARQ_PUBLIC_ORIGIN is required");
  return origin;
}

export function publicUrl(path = "/"): string {
  const origin = requirePublicOrigin();
  if (!path || path === "/") return origin;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${p}`;
}

export function webhookUrl(): string {
  return publicUrl("/api/telegram");
}

/** Internal worker kick — deployment URL, not a public brand domain. */
export function internalOrigin(): string {
  if (typeof process !== "undefined") {
    const vercel = process.env.VERCEL_URL?.trim();
    if (vercel) return normalizeOrigin(`https://${vercel.replace(/^https?:\/\//, "")}`);
  }
  return envOrigin();
}

export function hostOf(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return "";
  }
}

function requestHost(host: string): string {
  return host.split(",")[0]?.trim().toLowerCase().replace(/:\d+$/, "") ?? "";
}

/**
 * www → public apex. Preview/deployment hosts stay as-is so internal
 * worker, webhook, and job routes keep working.
 */
export function shouldCanonicalRedirect(host: string, origin = getPublicOrigin()): string | null {
  if (!origin || !host) return null;
  const want = hostOf(origin);
  const got = requestHost(host);
  if (!want || !got || got === want) return null;
  const apex = want.replace(/^www\./, "");
  if (got === `www.${apex}` || got.startsWith("www.")) return origin;
  return null;
}

export function canonicalRedirectUrl(
  host: string,
  pathname: string,
  search = "",
  origin = getPublicOrigin(),
): string | null {
  const dest = shouldCanonicalRedirect(host, origin);
  if (!dest) return null;
  const path = !pathname || pathname === "/" ? "/" : pathname.startsWith("/") ? pathname : `/${pathname}`;
  const query = search && !search.startsWith("?") && search.length > 0 ? `?${search}` : search;
  return `${dest}${path === "/" && !query ? "" : path === "/" ? "/" : path}${query}`;
}

export function isPublicAbsoluteUrl(url: string, origin = getPublicOrigin()): boolean {
  if (!origin) return false;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}` === origin;
  } catch {
    return false;
  }
}
