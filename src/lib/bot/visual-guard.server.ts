import { grokApiKey } from "./config.server";
import { grokReady } from "./grok.server";
import { MediaBlockedError, matchPornDomain } from "./safety";
import type { ExtractResult } from "../media/types";

const LOOK = `انظر إلى صورة المقطع فقط. لا تعتمد على العنوان.
أجب JSON فقط: {"explicit":true} إذا كان المحتوى إباحيًا واضحًا: عري جنسي أو فعل جنسي.
{"explicit":false} للباقي: ملابس عادية، رياضة، أخبار، ضحك، أغاني، عائلة.
لا تشرح.`;

export async function assertAdultVisual(url: string, result?: ExtractResult): Promise<void> {
  const domain = matchPornDomain(url) || result?.items.map((i) => matchPornDomain(i.url)).find(Boolean);
  if (domain) {
    throw new MediaBlockedError("أُزيل المقطع. المحتوى الإباحي ممنوع.", domain.domain, "nsfw");
  }
  const thumb = result?.items.find((i) => i.thumbnail)?.thumbnail;
  if (!thumb || !/^https:\/\//i.test(thumb) || !grokReady()) return;
  const explicit = await thumbnailIsExplicit(thumb);
  if (explicit) {
    throw new MediaBlockedError("أُزيل المقطع. المحتوى الإباحي ممنوع.", "محتوى الصورة", "nsfw");
  }
}

async function thumbnailIsExplicit(imageUrl: string): Promise<boolean> {
  const key = grokApiKey();
  if (!key) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "grok-4",
        temperature: 0,
        max_tokens: 40,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: LOOK },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return false;
    const parsed = JSON.parse(text.slice(start, end + 1)) as { explicit?: unknown };
    return parsed.explicit === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
