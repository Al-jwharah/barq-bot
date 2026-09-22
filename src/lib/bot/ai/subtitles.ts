/**
 * A4 — Auto-subtitles opt-in: toggle + pipeline scaffold (burn deferred).
 * Working MVP: user can enable intent; we scaffold SRT from transcript/title.
 */
import { lastClip } from "../session.server";
import { redactSecrets } from "../grok.server";

export const SUBTITLES_CALLBACK = "ai:subs";
export const SUBTITLES_TOGGLE_CALLBACK = "ai:subs:toggle";
export const SUBTITLES_BTN = "ترجمة اختيارية";

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

/** Scaffold cues from plain text / title when Whisper burn is not available. */
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

export type SubtitlesPipelineResult = {
  optedIn: boolean;
  srt: string;
  status: "ready_scaffold" | "burn_deferred" | "disabled" | "no_clip";
  message: string;
};

export async function runSubtitlesPipeline(userId: number): Promise<SubtitlesPipelineResult> {
  if (!subtitlesFeatureEnabled()) {
    return {
      optedIn: false,
      srt: "",
      status: "disabled",
      message: "الترجمة التلقائية مطفأة من الإعدادات.",
    };
  }
  const optedIn = isSubtitlesOptedIn(userId);
  if (!optedIn) {
    return {
      optedIn: false,
      srt: "",
      status: "ready_scaffold",
      message:
        "الترجمة اختيارية ⚡️\nاضغط زر التفعيل ثم أعد الطلب.\nالحرق داخل الفيديو مؤجّل (ثقيل على العامل).",
    };
  }
  const clip = lastClip(userId);
  if (!clip?.url) {
    return { optedIn: true, srt: "", status: "no_clip", message: "حمّل مقطعًا أولًا." };
  }
  const base = clip.title || clip.url;
  const cues = scaffoldCuesFromText(base, clip.duration && clip.duration > 0 ? clip.duration : 30);
  const srt = cuesToSrt(cues);
  if (subtitlesBurnEnabled()) {
    return {
      optedIn: true,
      srt,
      status: "burn_deferred",
      message:
        "مسار الحرق مفعّل بالإعداد لكن القصّ الثقيل مؤجّل في هذه النسخة.\nإليك مسودة SRT:\n\n" +
        srt.slice(0, 2800),
    };
  }
  return {
    optedIn: true,
    srt,
    status: "ready_scaffold",
    message:
      "مسودة ترجمة (SRT) ⚡️\nالحرق داخل الملف لاحقًا.\n\n" + srt.slice(0, 2800),
  };
}

export function subtitlesEnvProposalLines(): string[] {
  return [`# ${SUBTITLES_ENV.flag}=on`, `# ${SUBTITLES_ENV.burnFlag}=off`];
}
