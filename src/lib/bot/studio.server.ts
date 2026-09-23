import { lastClip } from "./session.server";
import { clipAiInput, grokReady } from "./grok.server";

const SYSTEM = `أنت استوديو صانع محتوى لبرق. من المقطع أخرج:
تيك توك: عنوان ≤ 80 حرف + 6 هاشتاقات + وصف سطرين
إنستغرام: عنوان + وصف + 8 هاشتاقات
يوتيوب: عنوان + وصف 4 أسطر + تاجات
غلاف: جملة تصوير واحدة بالعربية (بدون صورة مولَّدة)
نبرة عربية خليجية خفيفة. لا تختلق مشاهد غير موجودة في العنوان.`;

export async function creatorStudio(userId: number): Promise<string> {
  const { recallClip } = await import("./library.server");
  const clip = (await recallClip(userId).catch(() => undefined)) ?? lastClip(userId);
  if (!clip?.url) return "حمّل المقطع أولاً ثم اضغط تجهيز للنشر.";
  if (!grokReady()) return "Barq AI يتهيأ. جرّب الاستوديو بعد لحظات.";
  const { grokApiKey, AI_TIMEOUT_MS } = await import("./config.server");
  const key = grokApiKey();
  if (!key) return "Barq AI غير جاهز.";
  const user = clipAiInput(`منصة:${clip.platform ?? "-"}\nعنوان:${clip.title ?? "-"}\nرابط:${clip.url}`);
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
    if (!res.ok) return "تعذر تجهيز النشر الآن.";
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return (json.choices?.[0]?.message?.content ?? "").trim() || "تعذر التجهيز.";
  } catch {
    return "تعذر تجهيز النشر الآن.";
  } finally {
    clearTimeout(t);
  }
}
