import { createFileRoute } from "@tanstack/react-router";
import {
  clipAiInput,
  grokReady,
  hideProviderError,
  redactSecrets,
} from "@/lib/bot/grok.server";
import {
  AI_ENABLED,
  AI_MAX_OUTPUT_TOKENS,
  AI_TIMEOUT_MS,
  grokApiKey,
} from "@/lib/bot/config.server";

const SYSTEM = `أنت Barq AI على موقع برق. المستخدم يلصق رابط فيديو ويسألك عنه.
أجب بالعربية الفصحى المبسّطة باختصار واضح (6–10 أسطر كحد أقصى).
إن وُجد عنوان/منصة استخدمها. لا تختلق مشاهد غير موجودة. لا تكشف أسرار أو مفاتيح.`;

export const Route = createFileRoute("/api/ai-playground")({
  server: {
    handlers: {
      GET: async () => {
        const ready = AI_ENABLED && grokReady();
        return Response.json({
          ready,
          reason: ready
            ? null
            : !AI_ENABLED
              ? "BARQ_AI_ENABLED=off"
              : "XAI_API_KEY missing — أضف المفتاح في بيئة التشغيل لتفعيل الملعب",
        });
      },
      POST: async ({ request }) => {
        if (!AI_ENABLED || !grokReady()) {
          return Response.json(
            {
              ok: false,
              disabled: true,
              error: !AI_ENABLED
                ? "Barq AI متوقف (BARQ_AI_ENABLED=off)"
                : "Barq AI غير جاهز — XAI_API_KEY غير مضبوط في البيئة",
            },
            { status: 503 },
          );
        }
        let url = "";
        let question = "";
        try {
          const body = (await request.json()) as { url?: string; question?: string };
          url = (body.url ?? "").trim();
          question = (body.question ?? "").trim();
        } catch {
          return Response.json({ error: "bad json" }, { status: 400 });
        }
        if (url.length < 8 && question.length < 2) {
          return Response.json({ error: "الصق رابطًا أو اكتب سؤالًا" }, { status: 400 });
        }
        const key = grokApiKey();
        if (!key) {
          return Response.json(
            { ok: false, disabled: true, error: "XAI_API_KEY missing" },
            { status: 503 },
          );
        }
        const user = clipAiInput(
          [url ? `الرابط: ${url}` : "", question ? `السؤال: ${question}` : "لخّص أو اشرح بإيجاز."]
            .filter(Boolean)
            .join("\n"),
        );
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
        try {
          const res = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: "grok-4.5",
              messages: [
                { role: "system", content: SYSTEM },
                { role: "user", content: user },
              ],
              max_tokens: Math.min(500, AI_MAX_OUTPUT_TOKENS),
              temperature: 0.4,
            }),
            signal: controller.signal,
          });
          if (!res.ok) {
            return Response.json({ ok: false, error: hideProviderError() }, { status: 502 });
          }
          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const answer = redactSecrets(data.choices?.[0]?.message?.content?.trim() || "");
          if (!answer) {
            return Response.json({ ok: false, error: hideProviderError() }, { status: 502 });
          }
          return Response.json({ ok: true, answer });
        } catch {
          return Response.json({ ok: false, error: hideProviderError() }, { status: 502 });
        } finally {
          clearTimeout(timer);
        }
      },
    },
  },
});
