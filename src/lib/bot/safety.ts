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
  /\b((full\s+)?porn(ographic)?\s*(movie|film|video)|xxx\s*(movie|film)|adult\s+(film|movie|content)|nsfw|onlyfans|fansly|18\+|age[-\s]?restricted)\b/i;

/** Owner lock: porn keyword filter is NOT narrowed (kept as in production). */
// "+18" needs the plus sign: a bare 18 matched ids/years in URLs (e.g. Suno song ids, 2018).
const AR_FILM_RE = /فيلم\s*(سكس|إباحي|اباحي|بورن)|بورن|مقطع\s*إباحي|سكس|إباحي|اباحي|\+\s*18|18\s*\+/;

/** Owner lock: music / women matchers are kept intact (not wired into the download path, same as production). */
const MUSIC_DOMAINS = new Set([
  "soundcloud.com",
  "on.soundcloud.com",
  "spotify.com",
  "open.spotify.com",
  "anghami.com",
  "deezer.com",
  "music.youtube.com",
  "music.apple.com",
  "audiomack.com",
  "bandcamp.com",
]);

const MUSIC_RE =
  /\b(official\s+audio|music\s+video|lyrics|remix|cover\s+song|\bmp3\b|spotify|soundcloud)\b/i;

const AR_MUSIC_RE = /أغني[ةه]|اغني[ةه]|أغاني|اغاني|موسيقى|موسيقه|طرب|غناء|كلمات الأغنية/;

const WOMEN_RE =
  /\b(thirst\s*trap|bikini|lingerie|hot\s+girl|only\s*fans|girl\s*dance)\b/i;

const AR_WOMEN_RE = /حريم|رقص\s*بنات|بنات\s*تيك|فيديوهات\s*بنات|خليجي\s*رقص|رقص\s*شرقي|مقاطع\s*بنات/;

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

export function matchMusicDomain(url: string): { domain: string } | null {
  const host = hostnameOf(url);
  if (!host) return null;
  for (const domain of MUSIC_DOMAINS) {
    if (hostMatchesDomain(host, domain)) return { domain };
  }
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

export function matchMusicKeywords(text: string): string | null {
  const sample = text.slice(0, 1800);
  if (AR_MUSIC_RE.test(sample)) return "الطلب أغنية أو موسيقى.";
  if (MUSIC_RE.test(sample)) return "الطلب أغنية أو مقطع موسيقي.";
  return null;
}

export function matchWomenKeywords(text: string): string | null {
  const sample = text.slice(0, 1800);
  if (AR_WOMEN_RE.test(sample)) return "الطلب محتوى حريم.";
  if (WOMEN_RE.test(sample)) return "الطلب محتوى حريم.";
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
    // Owner lock: same thresholds as production (>=0.5); music/women verdicts still block (never ban).
    const softBlock = kind === "music" || kind === "women";
    if (parsed.block === true && (pornBlock || softBlock) && confidence >= 0.5) {
      return {
        block: true,
        kind: pornBlock ? (kind === "domain" || kind === "porn_film" || kind === "nsfw" ? kind : "nsfw") : kind,
        confidence,
        evidence: evidence || (pornBlock ? "محتوى إباحي محظور." : "خارج تخصص البوت."),
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
