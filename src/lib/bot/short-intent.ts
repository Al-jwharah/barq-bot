/**
 * Short-link / اختصار intent — synonyms users type after download.
 * Single source for router / handle / keyboard labels.
 */

export const SHORT_LINK_BTN = "رابط مختصر";
export const SHORT_LINK_BTN_LEGACY = "رابط مؤقت";

const EXACT = new Set(
  [
    SHORT_LINK_BTN,
    SHORT_LINK_BTN_LEGACY,
    "🔗 رابط مؤقت",
    "رابط مختصر 24س",
    "رابط مختصر 24 ساعة",
    "رابط قصير",
    "اختصار",
    "اختصر",
    "اختصر الرابط",
    "اختصار الرابط",
    "اشغله",
    "شغّله",
    "شغله",
    "/short",
    "short",
  ].map((s) => s.trim().toLowerCase()),
);

export function normalizeShortIntent(text: string): string {
  return text
    .trim()
    .replace(/^\//, "")
    .replace(/@\w+/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isShortLinkIntent(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  if (/^\/short(?:@\w+)?(?:\s|$)/i.test(raw)) return true;
  if (/^\/اختصار(?:@\w+)?(?:\s|$)/i.test(raw)) return true;
  const n = normalizeShortIntent(raw);
  if (EXACT.has(n)) return true;
  if (/(?:رابط\s*مختصر|رابط\s*مؤقت|رابط\s*قصير|اختصار)/.test(n) && n.length <= 40) {
    return true;
  }
  return false;
}

export { isShortLinkIntent as isShortCommand };
