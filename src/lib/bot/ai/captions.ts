/**
 * A2 — Smart caption generator: content-aware + tones فصحى / خليجي / مصري + copy.
 */
import { clipAiInput, grokReady, hideProviderError, redactSecrets } from "../grok.server";
import { lastClip, type LastClip } from "../session.server";
import { AI_ENABLED, AI_MAX_OUTPUT_TOKENS, AI_TIMEOUT_MS, grokApiKey } from "../config.server";

const API = "https://api.x.ai/v1/chat/completions";

export const CAPTION_TONES = ["fusha", "khaleeji", "masri"] as const;
export type CaptionTone = (typeof CAPTION_TONES)[number];

export const CAPTION_TONE_LABEL: Record<CaptionTone, string> = {
  fusha: "فصحى",
  khaleeji: "خليجي",
  masri: "مصري",
};

export function isCaptionTone(v: string): v is CaptionTone {
  return (CAPTION_TONES as readonly string[]).includes(v);
}

export function captionCallback(tone: CaptionTone): string {
  return `ai:cap:${tone}`;
}

export function parseCaptionCallback(data: string): CaptionTone | null {
  const m = /^ai:cap:(fusha|khaleeji|masri)$/.exec(data);
  return m ? (m[1] as CaptionTone) : null;
}

const TONE_HINT: Record<CaptionTone, string> = {
  fusha: "اكتب بالفصحى الواضحة المختصرة.",
  khaleeji: "اكتب بلهجة خليجية خفيفة وودّية (بدون إفراط).",
  masri: "اكتب بلهجة مصرية خفيفة مفهومة.",
};

export function buildCaptionSystem(tone: CaptionTone): string {
  return `أنت مولّد كابشن لمنصات التواصل داخل بوت برق.
${TONE_HINT[tone]}
أخرج بالضبط:
1) كابشن قصير ≤ 220 حرف جاهز للنسخ
2) سطر هاشتاقات (4–8)
3) سطر CTA قصير
لا تختلق مشاهد غير موجودة في العنوان/الوصف.
ضع الكابشن بين علامات:
<<<COPY
...
COPY>>>`;
}

export function buildCaptionUser(clip: LastClip, tone: CaptionTone): string {
  return clipAiInput(
    [
      `النبرة: ${CAPTION_TONE_LABEL[tone]}`,
      `المنصة: ${clip.platform ?? "-"}`,
      `العنوان: ${clip.title ?? "-"}`,
      `الرابط: ${clip.url}`,
      "ولّد كابشن جاهز للنسخ.",
    ].join("\n"),
  );
}

/** Extract copy block; fall back to full text. */
export function extractCopyBlock(raw: string): { caption: string; copyText: string } {
  const text = redactSecrets(String(raw || "").trim());
  const m = text.match(/<<<COPY\s*([\s\S]*?)\s*COPY>>>/i);
  const block = (m?.[1] ?? text).trim();
  const caption = block.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? block;
  return { caption: caption.slice(0, 280), copyText: block.slice(0, 1200) };
}

async function chatCaption(system: string, user: string): Promise<string> {
  const key = grokApiKey();
  if (!key) throw new Error("no key");
  const models = ["grok-4.5", "grok-4", "grok-3"];
  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: Math.min(420, AI_MAX_OUTPUT_TOKENS),
          temperature: 0.55,
        }),
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = (json.choices?.[0]?.message?.content ?? "").trim();
      if (text) return text;
    } catch {
      /* next */
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("caption failed");
}

export async function generateSmartCaption(
  userId: number,
  tone: CaptionTone,
): Promise<{ text: string; copyText: string }> {
  if (!AI_ENABLED) return { text: "Barq AI متوقف مؤقتًا.", copyText: "" };
  if (!grokReady()) return { text: "Barq AI يتهيأ. جرّب الكابشن بعد لحظات.", copyText: "" };
  const clip = lastClip(userId);
  if (!clip?.url) {
    return { text: "حمّل المقطع أولًا ثم اختر نبرة الكابشن.", copyText: "" };
  }
  try {
    const raw = await chatCaption(buildCaptionSystem(tone), buildCaptionUser(clip, tone));
    const { copyText, caption } = extractCopyBlock(raw);
    const header = `كابشن · ${CAPTION_TONE_LABEL[tone]} ⚡️\n(انسخ من الكتلة تحت)`;
    return {
      text: `${header}\n\n${copyText || caption}`,
      copyText: copyText || caption,
    };
  } catch (err) {
    return { text: hideProviderError(err), copyText: "" };
  }
}

export function captionToneButtons(): Array<Array<{ text: string; callback_data: string }>> {
  return [
    CAPTION_TONES.map((tone) => ({
      text: CAPTION_TONE_LABEL[tone],
      callback_data: captionCallback(tone),
    })),
  ];
}
