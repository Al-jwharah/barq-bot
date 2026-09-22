export type PornVerdict = {
  block: boolean;
  kind: "porn_film" | "nsfw" | "music" | "women" | "comedy" | "news" | "mainstream" | "other" | "domain" | "csam";
  confidence: number;
  evidence: string;
};

export class MediaBlockedError extends Error {
  evidence: string;
  kind: string;

  constructor(message: string, evidence: string, kind = "other") {
    super(message);
    this.name = "MediaBlockedError";
    this.evidence = evidence;
    this.kind = kind;
  }
}

/** User-facing purpose: general video downloader (music allowed; adult tube sites blocked). */
export const BOT_PURPOSE =
  "برق ⚡️ لتحميل الفيديو\n\nالصق الرابط ويصلك الملف.\nيدعم يوتيوب وتيك توك وإنستغرام وإكس وغيرها.";

const PORN_TLDS = new Set(["xxx", "sex", "porn", "adult"]);

/** Existing adult-tube / NSFW hosting blocklist — checked BEFORE extract/download. */
const PORN_DOMAINS = new Set([
  "pornhub.com",
  "pornhub.org",
  "pornhub.net",
  "pornhubpremium.com",
  "xvideos.com",
  "xvideos.es",
  "xvideos2.com",
  "xnxx.com",
  "xnxx.es",
  "xnxx.tv",
  "xhamster.com",
  "xhamster.desi",
  "xhamster2.com",
  "xhamsterlive.com",
  "redtube.com",
  "youporn.com",
  "spankbang.com",
  "tube8.com",
  "tnaflix.com",
  "beeg.com",
  "eporner.com",
  "hqporner.com",
  "spankwire.com",
  "keezmovies.com",
  "porntube.com",
  "4tube.com",
  "porntrex.com",
  "porn00.org",
  "porn300.com",
  "xozilla.com",
  "youjizz.com",
  "motherless.com",
  "pornone.com",
  "pornhat.com",
  "sxyprn.com",
  "xmoviesforyou.com",
  "fapster.xxx",
  "chaturbate.com",
  "stripchat.com",
  "bongacams.com",
  "cam4.com",
  "onlyfans.com",
  "fansly.com",
  "manyvids.com",
  "clips4sale.com",
  "adultempire.com",
  "jable.tv",
  "missav.com",
  "missav.ws",
  "javmost.com",
  "javlibrary.com",
  "avgle.com",
  "hanime.tv",
  "rule34.xxx",
  "nhentai.net",
  "xvideos-cdn.com",
  "phncdn.com",
  "xnxx-cdn.com",
]);

const STUDIO_RE =
  /\b(brazzers|bangbros|reality[\s-]?kings|digital[\s-]?playground|vixen\b|blacked\b|tushy\b|naughty[\s-]?america|bellesa|deeper\.com|pornpros|fake[\s-]?taxi)\b/i;

const FILM_RE =
  /\b((full\s+)?porn(ographic)?\s*(movie|film|video)|xxx\s*(movie|film)|adult\s+(film|movie)|onlyfans|fansly)\b/i;

/** Explicit Arabic porn-film phrases only — bare إباحي/سكس alone are common in religious warnings. */
const AR_FILM_RE = /فيلم\s*(سكس|إباحي|اباحي|بورن)|مقطع\s*إباحي|بورن/;

/** Mainstream platforms: never block on porn keywords (CSAM still blocked). Domain blocklist is separate. */
const MAINSTREAM_DOMAINS = [
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "facebook.com",
  "fb.watch",
  "x.com",
  "twitter.com",
  "reddit.com",
  "vimeo.com",
  "snapchat.com",
  "threads.net",
];

/** Only underage / CSAM material remains auto-ban + hard-block. */
const CSAM_RE =
  /\b(csam|child\s*porn|child\s*sex(?:ual)?|underage\s*(?:sex|porn|nude)|pedo(?:phile|philia)?|preteen\s*(?:sex|porn)|infant\s*porn)\b/i;

const AR_CSAM_RE =
  /إباحي[ةه]?\s*(أطفال|قاصر|قصّر)|استغلال\s*(جنسي)?\s*(أطفال|قاصر)|مواد\s*(جنسي[ةه]?\s*)?(أطفال|قاصر)|تصوير\s*قاصر/;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostMatchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function isMainstreamHost(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  for (const domain of MAINSTREAM_DOMAINS) {
    if (hostMatchesDomain(host, domain)) return true;
  }
  return false;
}

export function matchPornDomain(url: string): { domain: string } | null {
  const host = hostnameOf(url);
  if (!host) return null;
  const labels = host.split(".");
  const tld = labels[labels.length - 1];
  if (tld && PORN_TLDS.has(tld)) {
    return { domain: host };
  }
  for (const domain of PORN_DOMAINS) {
    if (hostMatchesDomain(host, domain)) return { domain };
  }
  return null;
}

/** Music domain blocklists stay off (product choice). */
export function matchMusicDomain(_url: string): { domain: string } | null {
  return null;
}

export function matchPornKeywords(text: string): string | null {
  const sample = text.slice(0, 1800);
  if (STUDIO_RE.test(sample)) {
    const m = sample.match(STUDIO_RE);
    return `استوديو أفلام إباحية معروف: ${m?.[1] ?? "studio"}`;
  }
  if (AR_FILM_RE.test(sample)) {
    return "النص يشير إلى محتوى إباحي أو +18.";
  }
  if (FILM_RE.test(sample)) {
    return "النص يشير إلى محتوى للبالغين أو إباحي.";
  }
  return null;
}

/** Music keyword blocks stay off. */
export function matchMusicKeywords(_text: string): string | null {
  return null;
}

/** Women/harem soft blocks stay off. */
export function matchWomenKeywords(_text: string): string | null {
  return null;
}

export function matchCsamKeywords(text: string): string | null {
  const sample = text.slice(0, 2400);
  if (CSAM_RE.test(sample) || AR_CSAM_RE.test(sample)) {
    return "محتوى يشتبه باستغلال قاصر — محظور.";
  }
  return null;
}

/** Auto-ban for CSAM and clear adult-tube / NSFW hits. Music/women never ban. */
export function isBanKind(kind: string): boolean {
  return kind === "csam" || kind === "porn_film" || kind === "nsfw" || kind === "domain";
}

export function userBlockMessage(kind = "other"): string {
  if (kind === "csam") return "هذا المحتوى محظور (حماية القُصّر).";
  if (kind === "domain" || kind === "porn_film" || kind === "nsfw") {
    return "هذا الرابط محظور — مواقع ومحتوى إباحي غير مسموح.";
  }
  return "";
}

/** Porn/NSFW domain verdicts only — music domains intentionally not blocked. */
export function domainVerdict(url: string): PornVerdict | null {
  const porn = matchPornDomain(url);
  if (porn) {
    return {
      block: true,
      kind: "domain",
      confidence: 1,
      evidence: `الموقع ${porn.domain} مخصّص للمحتوى الإباحي.`,
    };
  }
  return null;
}

export function metadataVerdict(input: {
  url: string;
  title?: string;
  text?: string;
  author?: string;
  platform?: string;
}): PornVerdict | null {
  const blob = [input.url, input.title, input.text, input.author, input.platform]
    .filter(Boolean)
    .join("\n");
  const csam = matchCsamKeywords(blob);
  if (csam) {
    return { block: true, kind: "csam", confidence: 1, evidence: csam };
  }
  // Mainstream hosts: never block on porn keywords (religious/educational mentions of الإباحية etc.).
  // CSAM above still applies; PORN_DOMAINS never matches these hosts.
  if (isMainstreamHost(input.url)) {
    return null;
  }
  const porn = matchPornKeywords(blob);
  if (porn) {
    return { block: true, kind: "nsfw", confidence: 0.95, evidence: porn };
  }
  return null;
}

/**
 * Sync gate used BEFORE extractMedia / yt-dlp download.
 * Domain + URL-keyword + CSAM checks only — does not rewrite platform extractors.
 */
export function assertPreExtractBlocklist(url: string): void {
  const domain = domainVerdict(url);
  if (domain?.block) {
    throw new MediaBlockedError(userBlockMessage(domain.kind), domain.evidence, domain.kind);
  }
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    decoded = url;
  }
  const meta = metadataVerdict({ url: decoded });
  if (meta?.block) {
    throw new MediaBlockedError(
      meta.kind === "csam" ? userBlockMessage("csam") : userBlockMessage(meta.kind),
      meta.evidence,
      meta.kind,
    );
  }
}

export function parseGrokVerdict(raw: string): PornVerdict | null {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as {
      block?: unknown;
      kind?: unknown;
      confidence?: unknown;
      evidence_ar?: unknown;
      evidence?: unknown;
    };
    const kindRaw = typeof parsed.kind === "string" ? parsed.kind.toLowerCase() : "other";
    const confidence = Number(parsed.confidence);
    const evidence =
      (typeof parsed.evidence_ar === "string" && parsed.evidence_ar.trim()) ||
      (typeof parsed.evidence === "string" && parsed.evidence.trim()) ||
      "";
    const isCsam =
      kindRaw === "csam" ||
      kindRaw === "child" ||
      kindRaw === "underage" ||
      kindRaw === "child_porn";
    if (parsed.block === true && isCsam && confidence >= 0.7) {
      return {
        block: true,
        kind: "csam",
        confidence,
        evidence: evidence || "محتوى يشتبه باستغلال قاصر.",
      };
    }
    const kind: PornVerdict["kind"] =
      kindRaw === "porn_film" ||
      kindRaw === "nsfw" ||
      kindRaw === "music" ||
      kindRaw === "women" ||
      kindRaw === "comedy" ||
      kindRaw === "news" ||
      kindRaw === "mainstream" ||
      kindRaw === "domain" ||
      kindRaw === "csam"
        ? (kindRaw as PornVerdict["kind"])
        : "other";
    const pornBlock =
      kind === "porn_film" ||
      kind === "nsfw" ||
      kind === "domain" ||
      kindRaw === "adult" ||
      kindRaw === "18+";
    // Music/women never block via classifier — product choice. Porn/NSFW/CSAM do.
    // NSFW needs high confidence (>=0.85); porn_film/domain need >=0.7. Prefer hardcore film/domain.
    const nsfwOk = kind === "nsfw" && confidence >= 0.85;
    const hardOk =
      (kind === "porn_film" || kind === "domain" || kindRaw === "adult" || kindRaw === "18+") &&
      confidence >= 0.7;
    if (parsed.block === true && pornBlock && (nsfwOk || hardOk)) {
      return {
        block: true,
        kind: kind === "domain" || kind === "porn_film" || kind === "nsfw" ? kind : "nsfw",
        confidence,
        evidence: evidence || "محتوى إباحي محظور.",
      };
    }
    return {
      block: false,
      kind,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      evidence: evidence || "مسموح.",
    };
  } catch {
    return null;
  }
}

/** Unused helper kept so hostnameOf is not tree-shaken oddly in tests. */
export function _safeHost(url: string): string | null {
  return hostnameOf(url);
}
