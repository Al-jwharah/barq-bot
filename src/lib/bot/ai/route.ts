/**
 * A5 — Free-text → Barq AI (xAI) routing helpers.
 * Pure functions so handle/router stay testable without Telegram or secrets.
 */

/** Reply-keyboard / marketing labels that must NOT burn an AI turn. */
export const AI_SKIP_LABELS = new Set(
  [
    "كيف يعمل",
    "دعم فني",
    "رابط مؤقت",
    "رابط مختصر 24س",
    "رابط مختصر",
    "اختصار",
    "اشغله",
    "/short",
    "/اختصار",
    "سجلي",
    "سجليّ",
    "سجل التحميل",
    "حدّي",
    "حدي",
    "حد التحميل",
    "رحلتي",
    "إنجازاتي",
    "أعجبني",
    "حسابي",
    "نقاطي",
    "طابوري",
    "حالة الاشتراك",
    "الاشتراك",
    "اشترك الآن",
    "تجديد الاشتراك",
    "كوبون",
    "كوبونات",
    "كود تفعيل",
    "دعوة",
    "إحالة",
    "ادعُ صديق",
    "ادع صديق",
    "موصى به",
    "بحث في السجل",
    "تجربة 7 أيام",
    "حالة برق",
    "القائمة",
    "بدء",
    "مشاهدة إعلان لتجديد 5 فيديوهات",
    "لوحة التحكم",
    "المراقبة",
    "الإحصائيات",
    "إرسال للجميع",
    "النظام",
    "القناة والمجاني",
    "أخبار القناة",
    "الإعلان",
    "إنهاء جروك",
    "إنهاء Barq AI",
    "إنهاء المحادثة",
    "النماذج",
    "انشر في القناة",
    "اسحب فائز",
    "ربط التخزين",
  ].map((s) => s.trim().toLowerCase()),
);

const AI_ENTRY_RE = /^(?:\/(?:ai|grok)(?:@\w+)?|barq\s*ai|جروك)(?:\s+|$)/i;

export type AiRouteDecision =
  | { kind: "skip" }
  | { kind: "entry" }
  | { kind: "chat"; prompt: string };

function normLabel(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when the message is only an AI menu entry (no question after /ai). */
export function isAiEntryOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\/(?:ai|grok)(?:@\w+)?$/i.test(t)) return true;
  const n = normLabel(t);
  return n === "barq ai" || n === "جروك";
}

/**
 * Parse /ai <question>, Barq AI: …, or plain free text destined for xAI.
 * Returns skip for known UI chrome so marketing buttons stay non-billable.
 */
export function decideAiRoute(text: string): AiRouteDecision {
  const raw = String(text || "").trim();
  if (!raw) return { kind: "skip" };
  if (AI_SKIP_LABELS.has(normLabel(raw))) return { kind: "skip" };
  if (raw.startsWith("/") && !AI_ENTRY_RE.test(raw)) return { kind: "skip" };

  const entryMatch = raw.match(/^(?:\/(?:ai|grok)(?:@\w+)?|barq\s*ai|جروك)(?:\s*[:؟]\s*|\s+)(.*)$/i);
  if (entryMatch) {
    const rest = (entryMatch[1] || "").trim();
    if (!rest) return { kind: "entry" };
    return { kind: "chat", prompt: rest };
  }

  if (isAiEntryOnly(raw)) return { kind: "entry" };
  return { kind: "chat", prompt: raw };
}

/** Free-text without URL should hit live xAI chat (not marketing-only). */
export function shouldRouteFreeTextToAi(text: string): boolean {
  return decideAiRoute(text).kind === "chat";
}

export function aiEntryCopy(dailyLimit: number): string {
  return (
    `أنا Barq AI — جاهز الآن ⚡️\n` +
    `اكتب سؤالك مباشرة، أو: لخّص المقطع · ابحث عن فيديو · اشرح · حوّل فكرة.\n` +
    `${dailyLimit} رسائل يوميًا. التحميل مجاني — الصق الرابط.`
  );
}
