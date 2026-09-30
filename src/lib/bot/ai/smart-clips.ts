/**
 * A3 — Smart Clips v1 for videos ≳90s: energy/heuristic window suggestions.
 * Basic version: duration + optional ffmpeg silencedetect energy peaks.
 * Does not require worker Docker edits; burn/cut of files is optional later.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LastClip } from "../session.server";
import { lastClip } from "../session.server";

export const SMART_CLIPS_MIN_SEC = 90;
export const SMART_CLIPS_CALLBACK = "ai:clips";
export const SMART_CLIPS_BTN = "مقاطع ذكية";

export type SmartClipWindow = {
  startSec: number;
  endSec: number;
  score: number;
  label: string;
};

export function ffmpegBin(): string {
  return (
    process.env.FFMPEG_PATH?.trim() ||
    process.env.FFPROBE_PATH?.trim() ||
    "/usr/bin/ffmpeg"
  );
}

export function isLongEnoughForSmartClips(durationSec: number | undefined | null): boolean {
  return typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec >= SMART_CLIPS_MIN_SEC;
}

/**
 * Heuristic windows when no media probe is available:
 * early hook, mid peak, late close — clipped to duration.
 */
export function heuristicClipWindows(durationSec: number, count = 3): SmartClipWindow[] {
  const dur = Math.max(0, Math.floor(durationSec));
  if (dur < SMART_CLIPS_MIN_SEC) return [];
  const win = Math.min(25, Math.max(12, Math.round(dur * 0.12)));
  const centers = [0.12, 0.48, 0.82].slice(0, count).map((r) => Math.round(dur * r));
  return centers.map((c, i) => {
    let start = Math.max(0, c - Math.floor(win / 2));
    const end = Math.min(dur, start + win);
    if (end - start < win) start = Math.max(0, end - win);
    const score = 1 - i * 0.12;
    const labels = ["افتتاح قوي", "ذروة منتصف", "ختام"];
    return {
      startSec: start,
      endSec: end,
      score,
      label: labels[i] ?? `مقطع ${i + 1}`,
    };
  });
}

/** Parse ffmpeg silencedetect stderr into noisy (energy) intervals. */
export function energyWindowsFromSilenceLog(
  stderr: string,
  durationSec: number,
  clipLen = 18,
): SmartClipWindow[] {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const line of stderr.split(/\r?\n/)) {
    const s = /silence_start:\s*([0-9.]+)/i.exec(line);
    if (s) starts.push(Number(s[1]));
    const e = /silence_end:\s*([0-9.]+)/i.exec(line);
    if (e) ends.push(Number(e[1]));
  }
  const silent: Array<[number, number]> = [];
  for (let i = 0; i < Math.min(starts.length, ends.length); i += 1) {
    silent.push([starts[i]!, ends[i]!]);
  }
  // Invert silence → speech/energy regions
  const noisy: Array<[number, number]> = [];
  let cursor = 0;
  for (const [ss, se] of silent.sort((a, b) => a[0] - b[0])) {
    if (ss > cursor + 2) noisy.push([cursor, ss]);
    cursor = Math.max(cursor, se);
  }
  if (durationSec > cursor + 2) noisy.push([cursor, durationSec]);
  const ranked = noisy
    .map(([a, b]) => {
      const len = b - a;
      const mid = (a + b) / 2;
      const start = Math.max(0, Math.floor(mid - clipLen / 2));
      const end = Math.min(Math.floor(durationSec), start + clipLen);
      return {
        startSec: start,
        endSec: end,
        score: len,
        label: "طاقة صوتية",
      } satisfies SmartClipWindow;
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 3);
  return ranked.length ? ranked : heuristicClipWindows(durationSec);
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ffmpeg timeout"));
    }, timeoutMs);
    child.stderr?.on("data", (c) => {
      err += String(c);
      if (err.length > 40_000) err = err.slice(-40_000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(err);
    });
  });
}

export async function probeEnergyWindows(
  mediaUrl: string,
  durationSec: number,
): Promise<SmartClipWindow[] | null> {
  if (!/^https:\/\//i.test(mediaUrl)) return null;
  const dir = await mkdtemp(join(tmpdir(), "barqclip-"));
  try {
    const res = await fetch(mediaUrl, { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 40 * 1024 * 1024) return null;
    const input = join(dir, "in.bin");
    await writeFile(input, buf);
    const stderr = await runFfmpeg(
      [
        "-hide_banner",
        "-i",
        input,
        "-af",
        "silencedetect=noise=-30dB:d=0.5",
        "-f",
        "null",
        "-",
      ],
      50_000,
    );
    return energyWindowsFromSilenceLog(stderr, durationSec);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function formatSmartClipsMessage(windows: SmartClipWindow[], durationSec: number): string {
  if (!windows.length) {
    return `المقطع أقصر من ${SMART_CLIPS_MIN_SEC} ثانية — المقاطع الذكية للفيديوهات الأطول.`;
  }
  const lines = windows.map((w, i) => {
    const a = formatTs(w.startSec);
    const b = formatTs(w.endSec);
    return `${i + 1}) ${w.label}: ${a} → ${b}`;
  });
  return (
    `مقاطع ذكية (تجريبي) · مدة ${formatTs(Math.round(durationSec))}\n` +
    `${lines.join("\n")}\n` +
    `افتح الفيديو واقفز لهذه اللحظات. قصّ الملف الآلي لاحقًا.`
  );
}

function formatTs(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export async function suggestSmartClips(userId: number): Promise<string> {
  const clip = lastClip(userId);
  if (!clip?.url) return "حمّل فيديو أولًا ثم اضغط «مقاطع ذكية».";
  const duration = clip.duration;
  if (!isLongEnoughForSmartClips(duration)) {
    return formatSmartClipsMessage([], duration ?? 0);
  }
  let windows = heuristicClipWindows(duration!);
  if (clip.mediaUrl) {
    const probed = await probeEnergyWindows(clip.mediaUrl, duration!);
    if (probed?.length) windows = probed;
  }
  return formatSmartClipsMessage(windows, duration!);
}

export function smartClipsEligible(clip: LastClip | undefined): boolean {
  return Boolean(clip && isLongEnoughForSmartClips(clip.duration));
}
