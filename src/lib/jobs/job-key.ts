import { createHash } from "node:crypto";
import { cleanUrl } from "../media/urls";

const DROP_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "igshid",
  "igsh",
  "si",
  "feature",
  "pp",
  "share",
  "ref",
  "ref_src",
  "ref_url",
  "mibextid",
  "s",
  "t",
  "nd",
  "rp",
  "spm",
]);

const HOST_ALIASES: Record<string, string> = {
  "twitter.com": "x.com",
  "mobile.twitter.com": "x.com",
  "m.twitter.com": "x.com",
  "fxtwitter.com": "x.com",
  "vxtwitter.com": "x.com",
  "fixupx.com": "x.com",
  "fixvx.com": "x.com",
  "youtu.be": "youtube.com",
  "m.youtube.com": "youtube.com",
  "music.youtube.com": "youtube.com",
  "youtube-nocookie.com": "youtube.com",
  "m.tiktok.com": "tiktok.com",
};

export function normalizeDownloadUrl(raw: string): string {
  const cleaned = cleanUrl(raw.trim());
  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return cleaned.toLowerCase();
  }
  parsed.protocol = "https:";
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  let host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  host = HOST_ALIASES[host] ?? host;
  parsed.hostname = host;

  if (host === "youtube.com" || host === "youtu.be") {
    const v =
      parsed.searchParams.get("v") ||
      parsed.pathname.match(/\/(shorts|embed|live)\/([^/?#]+)/)?.[2] ||
      parsed.pathname.replace(/^\//, "").split("/")[0];
    parsed.hostname = "youtube.com";
    parsed.pathname = "/watch";
    parsed.search = v ? `?v=${v}` : "";
    return parsed.toString();
  }

  if (host === "x.com" || host === "twitter.com") {
    const status = parsed.pathname.match(/\/status\/(\d+)/);
    parsed.pathname = status ? `/i/status/${status[1]}` : parsed.pathname.replace(/\/+$/, "") || "/";
    parsed.search = "";
    return parsed.toString();
  }

  if (host === "vt.tiktok.com" || host === "vm.tiktok.com") {
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  }

  if (host.endsWith("tiktok.com") || host.endsWith("instagram.com")) {
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  }

  for (const key of [...parsed.searchParams.keys()]) {
    if (DROP_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString();
}

export function makeJobKey(userId: number | string, url: string): string {
  const normalized = normalizeDownloadUrl(url);
  const raw = `${String(userId).trim()}:${normalized}`;
  if (raw.length <= 400) return raw;
  return `${String(userId).trim()}:sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}

export const ACTIVE_JOB_STATUSES = ["pending", "processing", "uploading"] as const;
