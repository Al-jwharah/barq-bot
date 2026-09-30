/**
 * A4 — Translate / subtitles: opt-in + live model draft (Arabic), burn deferred.
 * Uses title/description via chat — never fakes success without a key.
 */
import { lastClip, type LastClip } from "../session.server";
import { clipAiInput, grokReady, hideProviderError, redactSecrets } from "../grok.server";
import { AI_ENABLED, AI_MAX_OUTPUT_TOKENS, AI_TIMEOUT_MS, grokApiKey } from "../config.server";
import {
  AI_DISABLED_AR,
  AI_MISSING_KEY_AR,
  AI_NO_CLIP_AR,
  BARQ_AI_BRAND,
  aiReadyGate,
} from "./copy";

export const SUBTITLES_CALLBACK = "ai:subs";
export const SUBTITLES_TOGGLE_CALLBACK = "ai:subs:toggle";
export const SUBTITLES_BTN = "ترجمة";

const API = "https://api.x.ai/v1/chat/completions";

/** Proposed ENV — document only. */
export const SUBTITLES_ENV = {
  flag: "BARQ_AI_SUBTITLES",
  burnFlag: "BARQ_AI_SUBTITLES_BURN",
} as const;

const g = globalThis as unknown as { __barqSubsOptIn?: Set<number> };

function optInSet(): Set<number> {
  if (!g.__barqSubsOptIn) g.__barqSubsOptIn = new Set();
  return g.__barqSubsOptIn;
}

export function subtitlesFeatureEnabled(): boolean {
  const raw = (process.env.BARQ_AI_SUBTITLES || "on").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}

export function subtitlesBurnEnabled(): boolean {
  const raw = (process.env.BARQ_AI_SUBTITLES_BURN || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

export function isSubtitlesOptedIn(userId: number): boolean {
  return optInSet().has(userId);
}

export function setSubtitlesOptIn(userId: number, on: boolean): boolean {
  if (on) optInSet().add(userId);
  else optInSet().delete(userId);
  return isSubtitlesOptedIn(userId);
}

export function toggleSubtitlesOptIn(userId: number): boolean {
  return setSubtitlesOptIn(userId, !isSubtitlesOptedIn(userId));
}

export type SrtCue = { index: number; startSec: number; endSec: number; text: string };

export function formatSrtTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function cuesToSrt(cues: SrtCue[]): string {
  return cues
    .map(
      (c) =>
        `${c.index}\n${formatSrtTime(c.startSec)} --> ${formatSrtTime(c.endSec)}\n${redactSecrets(c.text).trim()}\n`,
    )
    .join("\n");
}

/** Scaffold cues from plain text / title when model output is plain lines. */
export function scaffoldCuesFromText(text: string, durationSec = 30): SrtCue[] {
  const cleaned = redactSecrets(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const chunks = cleaned.match(/.{1,42}(\s|$)/g)?.map((c) => c.trim()).filter(Boolean) ?? [cleaned];
  const slot = Math.max(2, durationSec / Math.max(1, chunks.length));
  return chunks.slice(0, 12).map((t, i) => ({
    index: i + 1,
    startSec: i * slot,
    endSec: Math.min(durationSec, (i + 1) * slot),
    text: t,
  }));
}

export function buildTranslateSystem(): string {
  return `أنت مترجم داخل بوت برق. اسمك «${BARQ_AI_BRAND}».
حوّل عنوان/وصف المقطع إلى ترجمة عربية واضحة جاهزة كخطوط ترجمة.
أخرج 3–8 أسطر عربية قصيرة فقط، سطر لكل فكرة — بدون ترقيم وبدون SRT.
لا تختلق محتوى غير موجود في المدخلات.
لا تذكر مزوّدًا تقنيًا.`;
}

export function buildTranslateUser(clip: LastClip): string {
  const parts = [
    `المنصة: ${clip.platform ?? "-"}`,
    `العنوان: ${clip.title ?? "-"}`,
    `الرابط: ${clip.url}`,
  ];
  if (clip.description?.trim()) {
    parts.push(`الوصف:\n${clip.description.trim().slice(0, 1200)}`);
  }
  parts.push("ترجم إلى أسطر عربية قصيرة للعرض كترجمة.");
  return clipAiInput(parts.join("\n"));
}

async function chatTranslate(clip: LastClip): Promise<string> {
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
            { role: "system", content: buildTranslateSystem() },
            { role: "user", content: buildTranslateUser(clip) },
          ],
          max_tokens: Math.min(420, AI_MAX_OUTPUT_TOKENS),
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = (json.choices?.[0]?.message?.content ?? "").trim();
      if (text) return redactSecrets(text);
    } catch {
      /* next */
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("translate failed");
}

export type SubtitlesPipelineResult = {
  optedIn: boolean;
  srt: string;
  status: "ready_scaffold" | "burn_deferred" | "disabled" | "no_clip" | "no_key" | "error";
  message: string;
};

export async function runSubtitlesPipeline(userId: number): Promise<SubtitlesPipelineResult> {
  if (!subtitlesFeatureEnabled()) {
    return {
      optedIn: false,
      srt: "",
      status: "disabled",
      message: "الترجمة مطفأة من الإعدادات.",
    };
  }
  const optedIn = isSubtitlesOptedIn(userId);
  if (!optedIn) {
    return {
      optedIn: false,
      srt: "",
      status: "ready_scaffold",
      message:
        `ترجمة «${BARQ_AI_BRAND}» اختيارية ⚡️\n` +
        `اضغط «تفعيل الترجمة» ثم أعد الطلب لتحصل على مسودة عربية من العنوان/الوصف.\n` +
        `الحرق داخل الفيديو مؤجّل (ثقيل على العامل).`,
    };
  }

  const gate = aiReadyGate({ enabled: AI_ENABLED, hasKey: grokReady() });
  if (gate) {
    return { optedIn: true, srt: "", status: "no_key", message: gate };
  }

  const clip = lastClip(userId);
  if (!clip?.url) {
    return { optedIn: true, srt: "", status: "no_clip", message: AI_NO_CLIP_AR };
  }

  try {
    const translated = await chatTranslate(clip);
    const duration = clip.duration && clip.duration > 0 ? clip.duration : 30;
    const cues = scaffoldCuesFromText(translated, duration);
    const srt = cuesToSrt(cues);
    const header = `ترجمة «${BARQ_AI_BRAND}» ⚡️\n(مسودة من العنوان/الوصف — الحرق لاحقًا)\n\n`;
    if (subtitlesBurnEnabled()) {
      return {
        optedIn: true,
        srt,
        status: "burn_deferred",
        message: header + "مسار الحرق مفعّل بالإعداد لكن القصّ الثقيل مؤجّل.\n\n" + srt.slice(0, 2600),
      };
    }
    return {
      optedIn: true,
      srt,
      status: "ready_scaffold",
      message: header + srt.slice(0, 2800),
    };
  } catch (err) {
    if (String(err).includes("no key")) {
      return { optedIn: true, srt: "", status: "no_key", message: AI_MISSING_KEY_AR };
    }
    return {
      optedIn: true,
      srt: "",
      status: "error",
      message: hideProviderError(err) || AI_DISABLED_AR,
    };
  }
}

export function subtitlesEnvProposalLines(): string[] {
  return [`# ${SUBTITLES_ENV.flag}=on`, `# ${SUBTITLES_ENV.burnFlag}=off`];
}
