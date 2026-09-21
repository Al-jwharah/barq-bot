export type PornVerdict = {
  block: boolean;
  kind: "porn_film" | "nsfw" | "music" | "women" | "comedy" | "news" | "mainstream" | "other" | "domain";
  confidence: number;
  evidence: string;
};

export class MediaBlockedError extends Error {
  evidence: string;
  kind: string;

  constructor(message: string, evidence: string, kind = "porn_film") {
    super(message);
    this.name = "MediaBlockedError";
    this.evidence = evidence;
    this.kind = kind;
  }
}

export const BOT_PURPOSE =
  "عذرًا، لا يمكن تحميل هذا المقطع.\n\nهذا البوت مخصّص فقط لـ:\n• المقاطع الإسلامية والدينية\n• القصص النافعة\n• مقاطع الضحك الخالية من الموسيقى\n\nيُمنع: الأغاني والموسيقى، ومحتوى الحريم، وأي إباحي أو +18.";

const PORN_TLDS = new Set(["xxx", "sex", "porn", "adult"]);

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

const STUDIO_RE =
  /\b(brazzers|bangbros|reality[\s-]?kings|digital[\s-]?playground|vixen\b|blacked\b|tushy\b|naughty[\s-]?america|bellesa|deeper\.com|pornpros|fake[\s-]?taxi)\b/i;

const FILM_RE =
  /\b((full\s+)?porn(ographic)?\s*(movie|film|video)|xxx\s*(movie|film)|adult\s+(film|movie|content)|nsfw|onlyfans|fansly|18\+|age[-\s]?restricted)\b/i;

const AR_FILM_RE = /فيلم\s*(سكس|إباحي|اباحي|بورن)|بورن|مقطع\s*إباحي|سكس|إباحي|اباحي|\+?\s*18/;

const MUSIC_RE =
  /\b(official\s+audio|music\s+video|lyrics|remix|cover\s+song|\bmp3\b|spotify|soundcloud)\b/i;

const AR_MUSIC_RE = /أغني[ةه]|اغني[ةه]|أغاني|اغاني|موسيقى|موسيقه|طرب|غناء|كلمات الأغنية/;

const WOMEN_RE =
  /\b(thirst\s*trap|bikini|lingerie|hot\s+girl|only\s*fans|girl\s*dance)\b/i;

const AR_WOMEN_RE = /حريم|رقص\s*بنات|بنات\s*تيك|فيديوهات\s*بنات|خليجي\s*رقص|رقص\s*شرقي|مقاطع\s*بنات/;

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

export function isBanKind(kind: string): boolean {
  return kind === "porn_film" || kind === "nsfw" || kind === "domain";
}

export function userBlockMessage(_kind = "other"): string {
  return "";
}

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
  const music = matchMusicDomain(url);
  if (music) {
    return {
      block: true,
      kind: "music",
      confidence: 1,
      evidence: `الموقع ${music.domain} مخصّص للأغاني والموسيقى.`,
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
  const porn = matchPornKeywords(blob);
  if (porn) {
    return { block: true, kind: "nsfw", confidence: 0.95, evidence: porn };
  }
  const music = matchMusicKeywords(blob);
  if (music) {
    return { block: true, kind: "music", confidence: 0.9, evidence: music };
  }
  const women = matchWomenKeywords(blob);
  if (women) {
    return { block: true, kind: "women", confidence: 0.9, evidence: women };
  }
  return null;
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
    const kindRaw = typeof parsed.kind === "string" ? parsed.kind : "other";
    const kind: PornVerdict["kind"] =
      kindRaw === "porn_film" ||
      kindRaw === "nsfw" ||
      kindRaw === "music" ||
      kindRaw === "women" ||
      kindRaw === "comedy" ||
      kindRaw === "news" ||
      kindRaw === "mainstream" ||
      kindRaw === "domain"
        ? kindRaw
        : "other";
    const confidence = Number(parsed.confidence);
    const evidence =
      (typeof parsed.evidence_ar === "string" && parsed.evidence_ar.trim()) ||
      (typeof parsed.evidence === "string" && parsed.evidence.trim()) ||
      "";
    const blockedKind =
      kind === "porn_film" ||
      kind === "nsfw" ||
      kind === "music" ||
      kind === "women" ||
      kind === "domain" ||
      kindRaw === "adult" ||
      kindRaw === "18+";
    const block = parsed.block === true && blockedKind && confidence >= 0.5;
    if (!block) {
      return {
        block: false,
        kind,
        confidence: Number.isFinite(confidence) ? confidence : 0,
        evidence: evidence || "مسموح ضمن تخصص البوت.",
      };
    }
    return {
      block: true,
      kind: blockedKind && kind !== "comedy" && kind !== "news" && kind !== "mainstream" ? kind : "nsfw",
      confidence,
      evidence: evidence || "خارج تخصص البوت.",
    };
  } catch {
    return null;
  }
}
