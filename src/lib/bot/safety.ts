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

/** User-facing purpose: general video downloader (not Islamic-only / music-blocked). */
export const BOT_PURPOSE =
  "برق ⚡️ لتحميل الفيديو\n\nالصق الرابط ويصلك الملف.\nيدعم يوتيوب وتيك توك وإنستغرام وإكس وغيرها.";

/** Only underage / CSAM material remains blocked. Adult NSFW, music, and “women/harem” soft blocks are off. */
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

/** @deprecated Adult domain blocklists removed — always null. Kept for import compatibility. */
export function matchPornDomain(_url: string): { domain: string } | null {
  return null;
}

/** @deprecated Music domain blocklists removed — always null. */
export function matchMusicDomain(_url: string): { domain: string } | null {
  return null;
}

/** @deprecated Adult keyword blocks removed — always null. */
export function matchPornKeywords(_text: string): string | null {
  return null;
}

/** @deprecated Music keyword blocks removed — always null. */
export function matchMusicKeywords(_text: string): string | null {
  return null;
}

/** @deprecated Women/harem soft blocks removed — always null. */
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

/** Auto-ban only for CSAM hits — never for ordinary adult/music content. */
export function isBanKind(kind: string): boolean {
  return kind === "csam";
}

export function userBlockMessage(_kind = "other"): string {
  return "";
}

/** Adult/music domain verdicts disabled. */
export function domainVerdict(_url: string): PornVerdict | null {
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
    // Adult/music/women never block via Grok — only CSAM.
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
