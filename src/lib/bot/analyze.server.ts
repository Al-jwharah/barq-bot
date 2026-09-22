import { lastClip } from "./session.server";
import { grokReady, clipAiInput, hideProviderError } from "./grok.server";
import { AI_ENABLED, AI_MAX_OUTPUT_TOKENS, AI_TIMEOUT_MS, grokApiKey } from "./config.server";
import { AI_MISSING_KEY_AR, AI_NO_CLIP_AR, BARQ_AI_BRAND, aiReadyGate } from "./ai/copy";

const SYSTEM = `أنت محرر محتوى داخل بوت برق. اسمك «${BARQ_AI_BRAND}».
من رابط/عنوان/وصف المقطع أخرج بالعربية:
1) ملخص 3 أسطر
2) عنوان تيك توك جذاب
3) 8 هاشتاقات
4) 3 لحظات مهمة محتملة (بدون اختلاق تفاصيل غير موجودة في العنوان/الوصف)
5) جملة واحدة: هل يظهر كلام واضح من العنوان أم لا
لا تختلق مشاهد. إن نقص السياق قل ذلك.
لا تذكر مزوّدًا تقنيًا.`;

export async function analyzeClip(userId: number): Promise<string> {
  const gate = aiReadyGate({ enabled: AI_ENABLED, hasKey: grokReady() });
  if (gate) return gate;
  const clip = lastClip(userId);
  if (!clip?.url) return AI_NO_CLIP_AR;
  const key = grokApiKey();
  if (!key) return AI_MISSING_KEY_AR;
  const parts = [
    `المنصة: ${clip.platform ?? "-"}`,
    `العنوان: ${clip.title ?? "-"}`,
    `الرابط: ${clip.url}`,
  ];
  if (clip.description?.trim()) {
    parts.push(`الوصف:\n${clip.description.trim().slice(0, 1200)}`);
  }
  parts.push("حلّل المقطع للناشر.");
  const user = clipAiInput(parts.join("\n"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "grok-4.5",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
        max_tokens: Math.min(700, AI_MAX_OUTPUT_TOKENS),
        temperature: 0.4,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const res2 = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: "grok-4",
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
          max_tokens: 500,
          temperature: 0.4,
        }),
        signal: controller.signal,
      });
      if (!res2.ok) return hideProviderError(new Error(String(res2.status)));
      const json2 = (await res2.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const out = (json2.choices?.[0]?.message?.content ?? "").trim();
      return out ? `تحليل «${BARQ_AI_BRAND}» ⚡️\n\n${out}` : hideProviderError();
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = (json.choices?.[0]?.message?.content ?? "").trim();
    return text ? `تحليل «${BARQ_AI_BRAND}» ⚡️\n\n${text}` : hideProviderError();
  } catch (err) {
    return hideProviderError(err);
  } finally {
    clearTimeout(timer);
  }
}
