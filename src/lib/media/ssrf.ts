import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_SCHEMES = new Set(["file:", "data:", "javascript:", "ftp:", "ws:", "wss:", "blob:", "about:"]);
const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata.internal",
  "kubernetes",
  "kubernetes.default",
  "kubernetes.default.svc",
]);
export const MAX_REDIRECTS = 5;

export class SsrfError extends Error {
  constructor(message = "الرابط غير مسموح") {
    super(message);
    this.name = "SsrfError";
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0]! << 24) >>> 0) + (nums[1]! << 16) + (nums[2]! << 8) + nums[3]!;
}

function inCidr(ip: number, prefix: string, bits: number): boolean {
  const base = ipv4ToInt(prefix);
  if (base == null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

export function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n == null) return true;
  return (
    inCidr(n, "0.0.0.0", 8) ||
    inCidr(n, "10.0.0.0", 8) ||
    inCidr(n, "100.64.0.0", 10) ||
    inCidr(n, "127.0.0.0", 8) ||
    inCidr(n, "169.254.0.0", 16) ||
    inCidr(n, "172.16.0.0", 12) ||
    inCidr(n, "192.168.0.0", 16) ||
    inCidr(n, "198.18.0.0", 15) ||
    inCidr(n, "224.0.0.0", 4) ||
    inCidr(n, "240.0.0.0", 4)
  );
}

function expandIpv6(ip: string): number[] | null {
  let h = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = h.indexOf("%");
  if (zone >= 0) h = h.slice(0, zone);
  let v4tail: number[] | null = null;
  const lastColon = h.lastIndexOf(":");
  const dotted = h.includes(".");
  if (dotted) {
    const v4 = lastColon >= 0 ? h.slice(lastColon + 1) : h;
    if (isIP(v4) !== 4) return null;
    const n = ipv4ToInt(v4);
    if (n == null) return null;
    v4tail = [(n >>> 16) & 0xffff, n & 0xffff];
    h = lastColon >= 0 ? h.slice(0, lastColon) : "";
    if (h.endsWith(":")) h = h.slice(0, -1);
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const parseParts = (s: string): number[] | null => {
    if (!s) return [];
    const parts = s.split(":");
    const out: number[] = [];
    for (const p of parts) {
      if (!p) return null;
      if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
      out.push(Number.parseInt(p, 16));
    }
    return out;
  };
  const left = parseParts(halves[0] ?? "");
  let right = halves.length === 2 ? parseParts(halves[1] ?? "") : [];
  if (!left || !right) return null;
  if (v4tail) right = [...right, ...v4tail];
  const missing = 8 - left.length - right.length;
  if (halves.length === 2) {
    if (missing < 0) return null;
    return [...left, ...Array(missing).fill(0), ...right];
  }
  if (left.length !== 8) return null;
  return left;
}

export function isBlockedIpv6(ip: string): boolean {
  const h = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("::ffff:")) {
    const v4 = h.slice("::ffff:".length);
    if (isIP(v4) === 4) return isBlockedIpv4(v4);
    const m = v4.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (m) {
      const a = Number.parseInt(m[1]!, 16);
      const b = Number.parseInt(m[2]!, 16);
      const mapped = `${(a >> 8) & 255}.${a & 255}.${(b >> 8) & 255}.${b & 255}`;
      return isBlockedIpv4(mapped);
    }
    return true;
  }
  const groups = expandIpv6(h);
  if (!groups) {
    const first = h.split(":")[0] ?? "";
    const n = Number.parseInt(first, 16);
    if (Number.isFinite(n) && (n & 0xfe00) === 0xfc00) return true;
    if (Number.isFinite(n) && (n & 0xffc0) === 0xfe80) return true;
    return true;
  }
  const allZero = groups.every((g) => g === 0);
  if (allZero) return true;
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true;
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff) {
    const v4 = `${(groups[6]! >> 8) & 255}.${groups[6]! & 255}.${(groups[7]! >> 8) & 255}.${groups[7]! & 255}`;
    return isBlockedIpv4(v4);
  }
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0) {
    const v4 = `${(groups[6]! >> 8) & 255}.${groups[6]! & 255}.${(groups[7]! >> 8) & 255}.${groups[7]! & 255}`;
    return isBlockedIpv4(v4);
  }
  const first = groups[0]!;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedIpv4(ip);
  if (kind === 6) return isBlockedIpv6(ip);
  return true;
}

/** Keep public addresses; a dual-stack host is allowed if at least one IP is public. */
export function pickPublicIps(ips: string[]): string[] {
  return ips.filter((ip) => !isBlockedIp(ip));
}

const WEIRD_IPV4_RE = /^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+)){0,3}$/i;

function looksLikeWeirdIpv4(hostname: string): boolean {
  if (!WEIRD_IPV4_RE.test(hostname)) return false;
  return isIP(hostname) !== 4;
}

export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return true;
  if (BLOCKED_HOSTS.has(h) || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan")) {
    return true;
  }
  if (h === "0.0.0.0" || h === "::" || h === "::1" || h === "0") return true;
  if (looksLikeWeirdIpv4(h)) return true;
  if (isIP(h) === 4) return isBlockedIpv4(h);
  if (isIP(h) === 6) return isBlockedIpv6(h);
  if (/^(127|10)\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^\d+$/.test(h)) return true;
  return false;
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new SsrfError("invalid url");
  }
  const protocol = url.protocol.toLowerCase();
  if (BLOCKED_SCHEMES.has(protocol)) throw new SsrfError("invalid url");
  if (protocol !== "https:" && protocol !== "http:") throw new SsrfError("invalid url");
  if (url.username || url.password) throw new SsrfError("invalid url");
  if (isPrivateHost(url.hostname)) throw new SsrfError("invalid url");
  return url;
}

export async function resolvePublicHost(hostname: string): Promise<string[]> {
  if (isPrivateHost(hostname)) throw new SsrfError("invalid url");
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new SsrfError("invalid url");
    return [hostname];
  }
  let records: { address: string }[];
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfError("invalid url");
  }
  if (!records.length) throw new SsrfError("invalid url");
  const publicIps = pickPublicIps(records.map((r) => r.address));
  if (!publicIps.length) throw new SsrfError("invalid url");
  return publicIps;
}

export async function assertSafeOutboundUrl(raw: string): Promise<URL> {
  const url = assertPublicHttpUrl(raw);
  await resolvePublicHost(url.hostname);
  return url;
}

export function assertPublicRedirect(location: string, base: string): URL {
  let next: URL;
  try {
    next = new URL(location, base);
  } catch {
    throw new SsrfError("invalid url");
  }
  return assertPublicHttpUrl(next.toString());
}

export async function safeFetch(
  raw: string,
  init: RequestInit & { timeoutMs?: number; maxRedirects?: number } = {},
): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? 15000;
  const maxRedirects = init.maxRedirects ?? MAX_REDIRECTS;
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertSafeOutboundUrl(current);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const { timeoutMs: _t, maxRedirects: _m, ...rest } = init;
      const res = await fetch(current, {
        ...rest,
        redirect: "manual",
        signal: init.signal ?? ctrl.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        try {
          await res.body?.cancel();
        } catch {
          /* ignore */
        }
        if (!loc) return res;
        if (hop >= maxRedirects) {
          // maxRedirects=0 means "give me the 3xx" so callers can read Location.
          if (maxRedirects === 0) return res;
          throw new SsrfError("too many redirects");
        }
        current = assertPublicRedirect(loc, current).toString();
        continue;
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new SsrfError("too many redirects");
}
