import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { TELEGRAM_CLOUD_MAX_MB } from "../bot/config.server";
import { ERROR_MESSAGES } from "../bot/errors";
import type { ExtractResult, MediaItem, MediaVariant } from "./types";
import { qualityLabel } from "./urls";
import { assertPublicHttpUrl, assertSafeOutboundUrl } from "./ssrf";
import { currentJobId, setJobChild } from "../jobs/proc-registry";

export { setJobChild, killJobProcess } from "../jobs/proc-registry";

const YTDLP_TIMEOUT_MS = 28000;
const ALLOWED_EXTRA_FLAGS = new Set(["--extractor-args"]);

/**
 * DOWNLOAD_TIMEOUT_MS defaults to 900000 (15m) in config.server, but Vercel
 * serverless maxDuration is lower (Hobby 10s, Pro 60s default / 300s max).
 * Cap spawn wait at 900000 so a huge env cannot hang forever. Do not raise
 * this spawn timeout above what the platform allows without documenting
 * `maxDuration` in vercel.json.
 */
const DOWNLOAD_TIMEOUT_CAP_MS = 900000;

export function telegramCloudMaxMb(): number {
  const n = Number(process.env.TELEGRAM_CLOUD_MAX_MB ?? TELEGRAM_CLOUD_MAX_MB) || 50;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 50;
}

export function telegramCloudMaxBytes(): number {
  return telegramCloudMaxMb() * 1024 * 1024;
}

export function maxFilesizeFlag(): string {
  return `${telegramCloudMaxMb()}M`;
}

/** True when a known size (bytes) exceeds Telegram cloud upload limit. Unknown/zero sizes are not "too large". */
export function isKnownOverTelegramCloud(size?: number | null): boolean {
  if (size == null || !Number.isFinite(size) || size <= 0) return false;
  return size > telegramCloudMaxBytes();
}

export function fileTooLargeError(): Error {
  return new Error(ERROR_MESSAGES.FILE_TOO_LARGE);
}

export function assertNotOverTelegramCloud(size?: number | null): void {
  if (isKnownOverTelegramCloud(size)) throw fileTooLargeError();
}

/** Drop variants whose known filesize exceeds the cloud cap. Throws FILE_TOO_LARGE when every known size is over. */
export function fitTelegramCloud(result: ExtractResult): ExtractResult {
  const items: MediaItem[] = [];
  let sawOversize = false;
  for (const item of result.items) {
    const variants = item.variants?.length
      ? item.variants
      : item.url
        ? [{ url: item.url, quality: "أصل", contentType: "video/mp4" } satisfies MediaVariant]
        : [];
    const kept = variants.filter((v) => !isKnownOverTelegramCloud(v.size));
    if (variants.some((v) => isKnownOverTelegramCloud(v.size))) sawOversize = true;
    if (kept.length === 0) continue;
    items.push({
      ...item,
      url: kept[0]!.url,
      variants: kept,
    });
  }
  if (items.length === 0 && sawOversize) throw fileTooLargeError();
  if (items.length === 0) return result;
  return { ...result, items };
}

type SpawnImpl = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

let spawnImpl: SpawnImpl = spawn;

/** Test seam — production always uses node:child_process.spawn. */
export function setYtDlpSpawn(fn: SpawnImpl | null): void {
  spawnImpl = fn ?? spawn;
}

export function resetYtDlpSpawn(): void {
  spawnImpl = spawn;
}

export function assertSafeOutputPath(outputPath: string, baseDir = tmpdir()): string {
  if (!outputPath || typeof outputPath !== "string") throw new Error("invalid output path");
  if (outputPath.includes("\0") || outputPath.includes("%2e") || outputPath.includes("%2E")) {
    throw new Error("invalid output path");
  }
  if (outputPath.split(/[/\\]/).includes("..") || outputPath.includes("..")) {
    throw new Error("invalid output path");
  }
  const base = resolve(baseDir);
  const resolved = isAbsolute(outputPath) ? resolve(outputPath) : resolve(base, outputPath);
  if (relative(base, resolved).startsWith("..") || isAbsolute(relative(base, resolved))) {
    throw new Error("invalid output path");
  }
  return resolved;
}

export function assertSafeDir(dir: string, baseDir = tmpdir()): string {
  if (!dir || typeof dir !== "string") throw new Error("invalid output path");
  if (dir.includes("\0") || dir.split(/[/\\]/).includes("..") || dir.includes("..")) {
    throw new Error("invalid output path");
  }
  const base = resolve(baseDir);
  const resolved = resolve(dir);
  const rel = relative(base, resolved);
  if (resolved !== base && (rel.startsWith("..") || isAbsolute(rel))) {
    throw new Error("invalid output path");
  }
  return resolved;
}

function looksLikeUserInputArg(token: string): boolean {
  if (!token || typeof token !== "string") return true;
  if (token.startsWith("-") && !ALLOWED_EXTRA_FLAGS.has(token)) return true;
  if (token.includes("\0") || token.includes("..")) return true;
  if (/[;&|`$()<>\\]/.test(token)) return true;
  if (/\s/.test(token) && !token.startsWith("youtube:")) return true;
  return false;
}

/** Only --extractor-args + a safe value. User-like tokens (flags, shell) are dropped. */
export function sanitizeYtDlpExtraArgs(extraArgs: string[]): string[] {
  if (!Array.isArray(extraArgs) || extraArgs.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < extraArgs.length; i += 1) {
    const flag = extraArgs[i]!;
    if (!ALLOWED_EXTRA_FLAGS.has(flag)) {
      continue;
    }
    const value = extraArgs[i + 1];
    if (value == null || typeof value !== "string" || looksLikeUserInputArg(value) || value.startsWith("-")) {
      if (value != null && typeof value === "string" && !String(value).startsWith("-")) i += 1;
      continue;
    }
    out.push(flag, value);
    i += 1;
  }
  return out;
}

export function buildYtDlpArgs(opts: {
  url: string;
  outputPath: string;
  extraArgs?: string[];
  dumpJson?: boolean;
  playlistEnd?: number;
}): string[] {
  const url = opts.url;
  if (typeof url !== "string" || url.includes("\0") || url !== url.trim()) {
    throw new Error("invalid url");
  }
  const extra = sanitizeYtDlpExtraArgs(opts.extraArgs ?? []);
  const head = opts.dumpJson ? (["-J", "--skip-download"] as const) : [];
  const end = Number(opts.playlistEnd);
  const playlist =
    Number.isFinite(end) && end > 0
      ? (["--yes-playlist", "--flat-playlist", "--playlist-end", String(Math.min(Math.trunc(end), 5))] as const)
      : (["--no-playlist"] as const);
  return [
    ...head,
    ...playlist,
    "--restrict-filenames",
    "--max-filesize",
    maxFilesizeFlag(),
    "--no-warnings",
    "-o",
    opts.outputPath,
    ...extra,
    "--",
    url,
  ];
}

function downloadTimeoutMs(fallback: number): number {
  const raw = Number(process.env.DOWNLOAD_TIMEOUT_MS) || fallback;
  return Math.min(raw, DOWNLOAD_TIMEOUT_CAP_MS);
}

export function spawnYtDlp(
  args: string[],
  cwd: string,
  timeoutMs = YTDLP_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<{ code: number; stdout: string }> {
  const safeCwd = assertSafeDir(cwd);
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) {
      reject(new Error("DOWNLOAD_CANCELLED"));
      return;
    }
    const options: SpawnOptions = {
      cwd: safeCwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONWARNINGS: "ignore" },
      windowsHide: true,
    };
    const child =
      spawnImpl === spawn
        ? spawn("yt-dlp", args, options)
        : spawnImpl("yt-dlp", args, options);
    const jobId = currentJobId();
    if (jobId) setJobChild(jobId, child);
    let stdout = "";
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const killChild = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already exited */
      }
    };
    const onAbort = () => {
      killChild();
      finish(() => reject(new Error("DOWNLOAD_CANCELLED")));
    };
    const timer = setTimeout(() => {
      killChild();
      finish(() => reject(new Error("DOWNLOAD_TIMEOUT")));
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < 8 * 1024 * 1024) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", () => {
      /* exit code only — never log stderr (cookies / headers) */
    });
    child.on("error", () => {
      finish(() => reject(new Error("DOWNLOAD_FAILED_SPAWN")));
    });
    child.on("close", (code) => {
      finish(() => {
        if (code === 0) resolvePromise({ code: 0, stdout });
        else reject(new Error(`DOWNLOAD_FAILED_${code ?? "kill"}`));
      });
    });
  });
}

export async function runDownloader(
  url: string,
  outputPath: string,
  extraArgs: string[] = [],
  signal?: AbortSignal,
): Promise<void> {
  await assertSafeOutboundUrl(url);
  const safeOut = assertSafeOutputPath(outputPath);
  const args = buildYtDlpArgs({ url, outputPath: safeOut, extraArgs });
  const timeout = downloadTimeoutMs(55000);
  await spawnYtDlp(args, dirname(safeOut), timeout, signal);
}

type YtDlpFormat = {
  format_id?: string;
  url?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  height?: number;
  width?: number;
  tbr?: number;
  filesize?: number;
  filesize_approx?: number;
  protocol?: string;
};

type YtDlpInfo = {
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  thumbnail?: string;
  duration?: number;
  webpage_url?: string;
  ext?: string;
  url?: string;
  height?: number;
  width?: number;
  filesize?: number;
  filesize_approx?: number;
  vcodec?: string;
  acodec?: string;
  formats?: YtDlpFormat[];
  entries?: Array<{ id?: string; url?: string; webpage_url?: string; title?: string }>;
};

function hasVideo(f: YtDlpFormat): boolean {
  return Boolean(f.vcodec && f.vcodec !== "none");
}

function hasAudio(f: YtDlpFormat): boolean {
  return Boolean(f.acodec && f.acodec !== "none");
}

function isHttp(f: YtDlpFormat): boolean {
  const p = (f.protocol ?? "https").toLowerCase();
  return p.startsWith("http") && !p.includes("m3u8") && !p.includes("dash");
}

function toVariant(f: YtDlpFormat): MediaVariant | null {
  if (!f.url) return null;
  try {
    assertPublicHttpUrl(f.url);
  } catch {
    return null;
  }
  const ext = f.ext || "mp4";
  const video = hasVideo(f);
  return {
    url: f.url,
    quality: qualityLabel(f.width, f.height),
    width: f.width,
    height: f.height,
    bitrate: f.tbr ? Math.round(f.tbr * 1000) : undefined,
    size: f.filesize || f.filesize_approx,
    contentType: video ? (ext === "webm" ? "video/webm" : "video/mp4") : ext === "webm" ? "audio/webm" : "audio/mp4",
  };
}

async function dump(url: string, extraArgs: string[] = [], playlistEnd?: number): Promise<YtDlpInfo> {
  await assertSafeOutboundUrl(url);
  const dir = await mkdtemp(join(tmpdir(), `barq-${randomBytes(6).toString("hex")}-`));
  try {
    const outputPath = join(dir, "%(id)s.%(ext)s");
    const args = buildYtDlpArgs({ url, outputPath, extraArgs, dumpJson: true, playlistEnd });
    const { stdout } = await spawnYtDlp(args, dir, downloadTimeoutMs(YTDLP_TIMEOUT_MS));
    const parsed = JSON.parse(stdout) as YtDlpInfo;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("DOWNLOAD_FAILED_empty");
    }
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : "DOWNLOAD_FAILED";
    if (/sign in|not a bot|cookies/i.test(message)) {
      throw new Error("يوتيوب يطلب تحققًا مؤقتًا. أعد المحاولة بعد قليل.");
    }
    if (/أكبر من حد|too large|file size|file_too_large/i.test(message)) {
      throw fileTooLargeError();
    }
    throw new Error(message.slice(0, 40));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function keepTelegramSized(variants: MediaVariant[]): MediaVariant[] {
  const kept = variants.filter((v) => !isKnownOverTelegramCloud(v.size));
  if (kept.length === 0 && variants.some((v) => isKnownOverTelegramCloud(v.size))) {
    throw fileTooLargeError();
  }
  return kept;
}

function pickItems(info: YtDlpInfo): MediaItem[] {
  const formats = info.formats ?? [];
  const muxed = formats
    .filter((f) => f.url && isHttp(f) && hasVideo(f) && hasAudio(f))
    .map(toVariant)
    .filter((v): v is MediaVariant => Boolean(v))
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bitrate ?? 0) - (a.bitrate ?? 0));

  const unique: MediaVariant[] = [];
  const seen = new Set<string>();
  for (const v of muxed) {
    const key = `${v.height ?? 0}:${v.quality}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(v);
  }

  if (unique.length === 0 && info.url && info.vcodec && info.vcodec !== "none") {
    try {
      assertPublicHttpUrl(info.url);
      unique.push({
        url: info.url,
        quality: qualityLabel(info.width, info.height),
        width: info.width,
        height: info.height,
        size: info.filesize || info.filesize_approx,
        contentType: info.ext === "webm" ? "video/webm" : "video/mp4",
      });
    } catch {
      /* skip internal urls */
    }
  }

  if (unique.length > 0) {
    const sized = keepTelegramSized(unique);
    if (!sized[0]) return [];
    return [
      {
        kind: "video",
        url: sized[0].url,
        thumbnail: info.thumbnail,
        width: sized[0].width,
        height: sized[0].height,
        duration: info.duration,
        variants: sized,
      },
    ];
  }

  const videoOnly = formats
    .filter((f) => f.url && isHttp(f) && hasVideo(f))
    .map(toVariant)
    .filter((v): v is MediaVariant => Boolean(v))
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  if (videoOnly[0]) {
    const sized = keepTelegramSized(videoOnly.slice(0, 8));
    if (!sized[0]) return [];
    return [
      {
        kind: "video",
        url: sized[0].url,
        thumbnail: info.thumbnail,
        width: sized[0].width,
        height: sized[0].height,
        duration: info.duration,
        variants: sized,
      },
    ];
  }

  const audioOnly = formats
    .filter((f) => f.url && isHttp(f) && hasAudio(f) && !hasVideo(f))
    .map(toVariant)
    .filter((v): v is MediaVariant => Boolean(v));
  if (audioOnly[0]) {
    const sized = keepTelegramSized(audioOnly.slice(0, 6));
    if (!sized[0]) return [];
    return [
      {
        kind: "audio",
        url: sized[0].url,
        thumbnail: info.thumbnail,
        duration: info.duration,
        variants: sized,
      },
    ];
  }
  return [];
}

export async function extractWithYtdlp(url: string, platform = "generic"): Promise<ExtractResult> {
  const clients =
    platform === "youtube"
      ? [
          ["--extractor-args", "youtube:player_client=android,android_vr"],
          ["--extractor-args", "youtube:player_client=ios,tv"],
          [],
        ]
      : platform === "x"
        ? [["--extractor-args", "twitter:api=syndication"], []]
        : [[]];

  let lastErr: unknown;
  for (const args of clients) {
    try {
      const info = await dump(url, args);
      const items = pickItems(info);
      if (items.length === 0) continue;
      return fitTelegramCloud({
        platform,
        id: info.id,
        title: info.title,
        author: info.uploader || info.channel,
        text: info.title,
        sourceUrl: info.webpage_url || url,
        items,
      });
    } catch (err) {
      lastErr = err;
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : "DOWNLOAD_FAILED";
  if (/أكبر من حد|too large|file size|file_too_large/i.test(message)) {
    throw fileTooLargeError();
  }
  throw new Error(message.slice(0, 40));
}

export async function extractPlaylistLead(url: string): Promise<ExtractResult> {
  await assertSafeOutboundUrl(url);
  const info = await dump(url, [], 1);
  const entry = info.entries?.[0];
  const id = entry?.id?.replace(/[^A-Za-z0-9_-]/g, "") ?? "";
  const watch =
    id.length >= 6
      ? `https://www.youtube.com/watch?v=${id}`
      : entry?.webpage_url || entry?.url || "";
  if (!watch || !/^https?:\/\//i.test(watch)) {
    throw new Error("ما قدرت أقرأ قائمة التشغيل. أرسل رابط المقطع نفسه.");
  }
  await assertSafeOutboundUrl(watch);
  const lead = await extractWithYtdlp(watch, "youtube");
  const total = info.entries?.length;
  const note = total && total > 1 ? `أول مقطع من قائمة التشغيل (${total}+). أرسل رابط المقطع للباقي.` : "مقطع من قائمة التشغيل.";
  return {
    ...lead,
    title: entry?.title || info.title || lead.title,
    text: [note, lead.text].filter(Boolean).join("\n"),
    sourceUrl: url,
  };
}
