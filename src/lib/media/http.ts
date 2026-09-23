import { assertPublicHttpUrl, isPrivateHost, safeFetch } from "./ssrf";

export { isPrivateHost };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export function mediaHeaders(extra?: HeadersInit, forUrl?: string): Headers {
  const h = new Headers({
    "User-Agent": UA,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
  });
  if (forUrl) {
    try {
      const host = new URL(forUrl).hostname.toLowerCase();
      if (host.includes("twimg") || host.includes("twitter") || host === "x.com" || host.endsWith(".x.com")) {
        h.set("Referer", "https://x.com/");
        h.set("Origin", "https://x.com");
      } else if (host.includes("fbcdn") || host.includes("facebook")) {
        h.set("Referer", "https://www.facebook.com/");
      } else if (host.includes("cdninstagram") || host.includes("instagram")) {
        h.set("Referer", "https://www.instagram.com/");
      } else if (host.includes("tikwm")) {
        h.set("Referer", "https://www.tikwm.com/");
      } else if (host.includes("tiktok") || host.includes("muscdn") || host.includes("byteicdn")) {
        h.set("Referer", "https://www.tiktok.com/");
      } else if (host.includes("googlevideo") || host.includes("youtube") || host.includes("ytimg") || host.includes("ggpht")) {
        h.set("Referer", "https://www.youtube.com/");
        h.set("Origin", "https://www.youtube.com");
      }
    } catch {
      /* ignore */
    }
  }
  if (extra) {
    const more = extra instanceof Headers ? extra : new Headers(extra);
    more.forEach((value, key) => h.set(key, value));
  }
  return h;
}

export async function fetchText(
  url: string,
  init?: RequestInit,
  timeoutMs = 15000,
): Promise<{ text: string; finalUrl: string; status: number }> {
  const res = await safeFetch(url, {
    ...init,
    headers: mediaHeaders(init?.headers),
    timeoutMs,
  });
  const text = await res.text();
  return { text, finalUrl: res.url || url, status: res.status };
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 15000,
): Promise<T> {
  const res = await safeFetch(url, {
    ...init,
    headers: mediaHeaders({
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      ...Object.fromEntries(
        init?.headers instanceof Headers ? init.headers : new Headers(init?.headers),
      ),
    }),
    timeoutMs,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function headSize(url: string): Promise<number | undefined> {
  try {
    const res = await safeFetch(url, {
      method: "HEAD",
      headers: mediaHeaders(undefined, url),
      timeoutMs: 2500,
    });
    const len = res.headers.get("content-length");
    if (len) return Number(len);
    if (res.ok) return undefined;
  } catch {
    /* try range */
  }

  try {
    const res = await safeFetch(url, {
      method: "GET",
      headers: mediaHeaders({ Range: "bytes=0-0" }, url),
      timeoutMs: 2500,
    });
    const range = res.headers.get("content-range");
    const total = range?.split("/")[1];
    if (total && total !== "*") return Number(total);
    const len = res.headers.get("content-length");
    if (len) return Number(len);
  } catch {
    return undefined;
  }
  return undefined;
}

export function isAllowedMediaHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (isPrivateHost(h)) return false;
  try {
    assertPublicHttpUrl(`https://${h}/`);
  } catch {
    return false;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false;
  if (h.includes(":")) return false;
  return true;
}

const TELEGRAM_URL_SEND_SKIP =
  /googlevideo\.com|youtube\.com|ytimg\.com|muscdn\.com|tiktokcdn|byteicdn|tiktokv\.com|tikcdn\.io|tikwm\.com|video\.twimg\.com|twimg\.com/i;

export function isTikcdnHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "tikcdn.io" || host.endsWith(".tikcdn.io");
  } catch {
    return false;
  }
}

export function isHostedMediaCdn(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return (
      h === "video.twimg.com" ||
      h.endsWith(".twimg.com") ||
      h.endsWith(".tiktokcdn.com") ||
      h.endsWith(".tiktokcdn-us.com") ||
      h.endsWith(".ibyteimg.com") ||
      h.includes("cdninstagram.com") ||
      h.endsWith(".fbcdn.net") ||
      h.endsWith(".pinimg.com")
    );
  } catch {
    return false;
  }
}

/** tikcdn.io/ssstik now serves a shutdown GIF — never URL-send it. */
export function telegramUrlSendBlocked(url: string): boolean {
  if (isTikcdnHost(url)) return true;
  return TELEGRAM_URL_SEND_SKIP.test(url);
}
