/**
 * A1 — Auto-summarize (لخّصه): Arabic 2–3 sentence summary after delivery.
 * Uses live chat on title/description/url (+ optional transcript).
 * Never invents scenes; fails loudly if API key missing.
 */
import { clipAiInput, grokReady, hideProviderError, redactSecrets } from "../grok.server";
import { lastClip, type LastClip } from "../session.server";
import { AI_ENABLED, AI_MAX_OUTPUT_TOKENS, AI_TIMEOUT_MS, grokApiKey } from "../config.server";
import {
  AI_DISABLED_AR,
  AI_MISSING_KEY_AR,
  AI_NO_CLIP_AR,
  BARQ_AI_BRAND,
  aiReadyGate,
} from "./copy";

const API = "https://api.x.ai/v1/chat/completions";

const SUMMARY_SYSTEM = `أنت ملخّص فيديو داخل بوت برق. اسمك «${BARQ_AI_BRAND}».
اكتب ملخصًا عربيًا فصيحًا في جملتين أو ثلاث فقط.
اعتمد على العنوان والوصف والنص المستخرج إن وُجد.
لا تختلق مشاهد أو أسماء غير موجودة في المدخلات.
لا تذكر مزوّدًا تقنيًا ولا أسماء نماذج خارجية.`;

/** Proposed provider ENV names (document only — do not set secrets in code). */
export const SUMMARIZE_ENV_PROPOSAL = {
  xaiKey: "XAI_API_KEY",
  transcribeFlag: "BARQ_AI_TRANSCRIBE",
  whisperUrl: "BARQ_WHISPER_URL",
  whisperKey: "BARQ_WHISPER_API_KEY",
} as const;

export function summarizeEnvProposalLines(): string[] {
  return [
    `# ${SUMMARIZE_ENV_PROPOSAL.transcribeFlag}=off`,
    `# ${SUMMARIZE_ENV_PROPOSAL.whisperUrl}=`,
    `# ${SUMMARIZE_ENV_PROPOSAL.whisperKey}=`,
  ];
}

export function transcribeEnabled(): boolean {
  const raw = (process.env.BARQ_AI_TRANSCRIBE || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

export function buildSummaryUserPayload(clip: LastClip, transcript?: string): string {
  const parts = [
    `المنصة: ${clip.platform ?? "-"}`,
    `العنوان: ${clip.title ?? "-"}`,
    `الرابط: ${clip.url}`,
  ];
  if (clip.description?.trim()) {
    parts.push(`الوصف:\n${clip.description.trim().slice(0, 1200)}`);
  }
  if (clip.duration != null && Number.isFinite(clip.duration)) {
    parts.push(`المدة_ث: ${Math.round(clip.duration)}`);
  }
  if (transcript?.trim()) {
    parts.push(`نص_مستخرج:\n${transcript.trim().slice(0, 2500)}`);
  }
  parts.push("لخّص المقطع بجملتين أو ثلاث اعتمادًا على المدخلات فقط.");
  return clipAiInput(parts.join("\n"));
}

export function clampSummaryAr(text: string): string {
  const cleaned = redactSecrets(String(text || "").trim()).replace(/\n{3,}/g, "\n\n");
  const sentences = cleaned
    .split(/(?<=[.!?؟。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 3) return cleaned.slice(0, 900);
  return sentences.slice(0, 3).join(" ").slice(0, 900);
}

async function chatSummary(user: string): Promise<string> {
  const key = grokApiKey();
  if (!key) throw new Error("no key");
  const models = ["grok-4.5", "grok-4", "grok-3"];
  let lastErr: unknown;
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
            { role: "system", content: SUMMARY_SYSTEM },
            { role: "user", content: user },
          ],
          max_tokens: Math.min(280, AI_MAX_OUTPUT_TOKENS),
          temperature: 0.35,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        lastErr = new Error(String(res.status));
        continue;
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = (json.choices?.[0]?.message?.content ?? "").trim();
      if (text) return clampSummaryAr(text);
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new Error("summary failed");
}

/**
 * Optional Whisper-compatible transcription. Returns null when disabled or unavailable.
 * Never throws secrets; never rotates keys.
 */
export async function maybeTranscribeClip(clip: LastClip): Promise<string | null> {
  if (!transcribeEnabled()) return null;
  if (!clip.mediaUrl || !/^https:\/\//i.test(clip.mediaUrl)) return null;
  const whisperUrl = (process.env.BARQ_WHISPER_URL || "").trim();
  const whisperKey = (process.env.BARQ_WHISPER_API_KEY || process.env.XAI_API_KEY || "").trim();
  if (!whisperUrl || !whisperKey) return null;
  try {
    const media = await fetch(clip.mediaUrl, { signal: AbortSignal.timeout(20_000) });
    if (!media.ok) return null;
    const buf = Buffer.from(await media.arrayBuffer());
    if (buf.byteLength < 1024 || buf.byteLength > 25 * 1024 * 1024) return null;
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "audio/mpeg" }), "clip.mp3");
    form.append("model", "whisper-1");
    form.append("language", "ar");
    const res = await fetch(whisperUrl.replace(/\/$/, "") + "/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${whisperKey}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { text?: string };
    const text = String(json.text || "").trim();
    return text ? redactSecrets(text).slice(0, 2500) : null;
  } catch {
    return null;
  }
}

export async function summarizeLastClip(userId: number): Promise<string> {
  const gate = aiReadyGate({ enabled: AI_ENABLED, hasKey: grokReady() });
  if (gate) return gate;
  const clip = lastClip(userId);
  if (!clip?.url) return AI_NO_CLIP_AR;
  try {
    const transcript = await maybeTranscribeClip(clip);
    const out = await chatSummary(buildSummaryUserPayload(clip, transcript ?? undefined));
    if (!out) return "تعذر التلخيص الآن. أعد المحاولة.";
    return `ملخص «${BARQ_AI_BRAND}» ⚡️\n\n${out}`;
  } catch (err) {
    if (String(err).includes("no key")) return AI_MISSING_KEY_AR;
    return hideProviderError(err);
  }
}

export const SUMMARIZE_CALLBACK = "ai:sum";
export const SUMMARIZE_BTN = "لخّصه";
