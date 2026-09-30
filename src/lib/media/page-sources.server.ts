/**
 * Free, no-signup ways to read a page that blocks cloud IPs, tried in order:
 *   1. direct fetch (browser UA)
 *   2. direct fetch as a chat-preview crawler (Barq is a Telegram bot; many sites
 *      serve og:video / player tags to link-preview crawlers)
 *   3. public link-preview mirrors built for chat apps (e.g. vxreddit for Reddit)
 *   4. Jina Reader (r.jina.ai) — free anonymous tier, rate limited
 * Each provider has in-memory health: after repeated failures it cools down.
 */
import { fetchText } from "./http";

export type PageSource = { html: string; finalUrl: string; via: "direct" | "crawler" | "mirror" | "reader" };

export const CRAWLER_UA = "TelegramBot (like TwitterBot)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const FAIL_LIMIT = 3;
const COOLDOWN_MS = 10 * 60 * 1000;
const health = new Map<string, { fails: number; until: number }>();

export function providerHealthy(name: string, now = Date.now()): boolean {
  const h = health.get(name);
  return !h || h.until <= now;
}

export function recordProvider(name: string, ok: boolean, now = Date.now()): void {
  if (ok) {
    health.delete(name);
    return;
  }
  const h = health.get(name) ?? { fails: 0, until: 0 };
  h.fails += 1;
  if (h.fails >= FAIL_LIMIT) {
    h.until = now + COOLDOWN_MS;
    h.fails = 0;
  }
  health.set(name, h);
}

export function resetProviderHealthForTests(): void {
  health.clear();
}

/** Bot walls / challenge pages that carry no media. */
export function looksBlocked(status: number, html: string): boolean {
  if (status === 401 || status === 403 || status === 429 || status === 503 || status >= 520) return true;
  const head = html.slice(0, 4000);
  return /<title>\s*(Just a moment|Attention Required|Blocked|Access denied)/i.test(head) || /cf-chl-|challenge-platform/i.test(head);
}

/** Chat-app preview mirrors (no signup). Only hosts whose own pages block cloud IPs. */
export function previewMirrors(url: string): string[] {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^(www\.|old\.|new\.|m\.)/, "");
    if (host === "reddit.com" || host === "redd.it") {
      const path = host === "redd.it" ? `/comments${u.pathname}` : u.pathname;
      return [`https://vxreddit.com${path}`, `https://rxddit.com${path}`];
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function readerUrl(url: string): string {
  return `https://r.jina.ai/${url}`;
}

async function get(url: string, headers: Record<string, string>, timeoutMs: number): Promise<{ html: string; finalUrl: string; status: number }> {
  const { text, finalUrl, status } = await fetchText(url, { headers }, timeoutMs);
  return { html: text.slice(0, 3_000_000), finalUrl, status };
}

type Step = { name: string; via: PageSource["via"]; run: () => Promise<{ html: string; finalUrl: string; status: number }>; base?: string };

/** Yields readable pages one by one; callers stop as soon as one yields media. */
export async function* pageSources(url: string, deadline: number): AsyncGenerator<PageSource> {
  const steps: Step[] = [
    { name: "direct", via: "direct", run: () => get(url, { "User-Agent": BROWSER_UA }, 12_000) },
    { name: "crawler", via: "crawler", run: () => get(url, { "User-Agent": CRAWLER_UA }, 10_000) },
    ...previewMirrors(url).map((m) => ({
      name: `mirror:${new URL(m).hostname}`,
      via: "mirror" as const,
      run: () => get(m, { "User-Agent": CRAWLER_UA }, 10_000),
      base: url,
    })),
    {
      name: "reader:jina",
      via: "reader",
      run: () => get(readerUrl(url), { "X-Return-Format": "html", Accept: "text/html" }, 20_000),
      base: url,
    },
  ];
  for (const step of steps) {
    if (deadline - Date.now() < 15_000) return;
    if (!providerHealthy(step.name)) continue;
    let res: { html: string; finalUrl: string; status: number } | null = null;
    try {
      res = await step.run();
    } catch {
      res = null;
    }
    const ok = Boolean(res && res.status < 400 && res.html.length > 200 && !looksBlocked(res.status, res.html));
    // Direct/crawler failures are about the target site, not our provider — don't cool them down.
    if (step.via === "mirror" || step.via === "reader") recordProvider(step.name, ok);
    if (!ok || !res) continue;
    yield { html: res.html, finalUrl: step.base ?? res.finalUrl, via: step.via };
  }
}
