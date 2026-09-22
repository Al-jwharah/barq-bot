import { lastClip } from "./session.server";
import { clipAiInput, grokReady, hideProviderError } from "./grok.server";
import { AI_ENABLED, AI_TIMEOUT_MS, grokApiKey } from "./config.server";
import { AI_MISSING_KEY_AR, AI_NO_CLIP_AR, BARQ_AI_BRAND, aiReadyGate } from "./ai/copy";

const SYSTEM = `أنت استوديو صانع محتوى داخل بوت برق. اسمك «${BARQ_AI_BRAND}».
من المقطع (عنوان/وصف فقط) أخرج:
تيك توك: عنوان ≤ 80 حرف + 6 هاشتاقات + وصف سطرين
إنستغرام: عنوان + وصف + 8 هاشتاقات
يوتيوب: عنوان + وصف 4 أسطر + تاجات
غلاف: جملة تصوير واحدة بالعربية (بدون صورة مولَّدة)
نبرة عربية خليجية خفيفة. لا تختلق مشاهد غير موجودة في العنوان/الوصف.
لا تذكر مزوّدًا تقنيًا.`;

export async function creatorStudio(userId: number): Promise<string> {
  const gate = aiReadyGate({ enabled: AI_ENABLED, hasKey: grokReady() });
  if (gate) return gate;
  const clip = lastClip(userId);
  if (!clip?.url) return AI_NO_CLIP_AR;
  const key = grokApiKey();
  if (!key) return AI_MISSING_KEY_AR;
  const parts = [
    `منصة:${clip.platform ?? "-"}`,
    `عنوان:${clip.title ?? "-"}`,
    `رابط:${clip.url}`,
  ];
  if (clip.description?.trim()) {
    parts.push(`وصف:${clip.description.trim().slice(0, 1200)}`);
  }
  const user = clipAiInput(parts.join("\n"));
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "grok-4",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
        max_tokens: 700,
        temperature: 0.5,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return hideProviderError(new Error(String(res.status)));
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = (json.choices?.[0]?.message?.content ?? "").trim();
    return text ? `تجهيز للنشر · «${BARQ_AI_BRAND}» ⚡️\n\n${text}` : hideProviderError();
  } catch (err) {
    return hideProviderError(err);
  } finally {
    clearTimeout(t);
  }
}
