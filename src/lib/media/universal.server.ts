/**
 * Universal video pipeline — works for any site, no platform list.
 *
 *   1. yt-dlp on the link itself (≈1800 extractors + its own generic extractor)
 *   2. read the page: og:video / twitter:player / <video> / <iframe> / JSON-LD /
 *      .m3u8 .mpd .mp4 strings → hand each candidate to yt-dlp (with Referer)
 *   3. ask Grok to pick the main video among URLs that really exist in the page
 *   4. fit Telegram: keep ≤ cap, otherwise split into parts with a stream copy
 *
 * Downloads land in a private tmp dir; callers must call cleanup().
 * Every outbound target passes the SSRF guard and the caller's content guard.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { ensureYtDlp, telegramCloudMaxBytes, ytDlpNetworkArgs } from "./ytdlp";
import { TELEGRAM_MAX_UPLOAD } from "../bot/config.server";

/** Bot upload cap (multipart), never above the configured cloud cap. */
export function uploadCapBytes(): number {
  return Math.min(telegramCloudMaxBytes(), TELEGRAM_MAX_UPLOAD);
}
import { ensureFfmpeg } from "./convert.server";
import { assertSafeOutboundUrl, SsrfError } from "./ssrf";
import { fetchText } from "./http";
import { pageSources, type PageSource } from "./page-sources.server";
import { iframeFromOembed, oembedLinks, pageMediaCandidates, pageTitle, pageUrlPool, type MediaCandidate } from "./page-media";
import { currentJobId, setJobChild } from "../jobs/proc-registry";
import { MediaBlockedError } from "../bot/safety";

export type UniversalPart = { path: string; size: number };

export type UniversalDownload = {
  kind: "video" | "audio";
  title?: string;
  extractor?: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  /** The URL that actually produced the file (page, embed, or manifest). */
  mediaUrl: string;
  via: "ytdlp" | "page" | "crawler" | "mirror" | "reader" | "ai";
  parts: UniversalPart[];
  cleanup: () => Promise<void>;
};

export type UniversalOptions = {
  /** Absolute epoch ms; work stops (and yt-dlp is killed) at this time. */
  deadline?: number;
  /** Content guard for every target URL (porn/music policy). Throw to block. */
  guard?: (target: string) => Promise<void>;
  signal?: AbortSignal;
  /** Test seam: page readers. */
  pages?: (url: string, deadline: number) => AsyncIterable<PageSource>;
  /** Test seam. */
  pickWithAi?: (pageUrl: string, title: string | undefined, pool: string[]) => Promise<string | null>;
};

const PART_TARGET_RATIO = 0.9;
const MAX_PARTS = 6;
const MAX_SOURCE_BYTES = 220 * 1024 * 1024;
/** Vercel gives one 512 MB /tmp per instance, shared by concurrent requests. */
const MIN_FREE_TMP_BYTES = 280 * 1024 * 1024;
const MAX_PARALLEL = 2;
let active = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(deadline: number): Promise<() => void> {
  while (active >= MAX_PARALLEL) {
    if (remaining(deadline) < 30_000) throw new Error("DOWNLOAD_TIMEOUT busy");
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 2000);
      waiters.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }
  active += 1;
  return () => {
    active -= 1;
    waiters.shift()?.();
  };
}

/** Remove leftovers from killed runs (our dirs, PyInstaller _MEI dirs) older than 10 minutes. */
async function sweepTmp(): Promise<void> {
  const base = tmpdir();
  const names = await readdir(base).catch(() => [] as string[]);
  const now = Date.now();
  await Promise.all(
    names
      .filter((n) => n.startsWith("barq-u-") || n.startsWith("_MEI") || n.startsWith("diag-") || n.startsWith("barqcv-"))
      .map(async (n) => {
        const full = join(base, n);
        const st = await stat(full).catch(() => null);
        if (st && now - st.mtimeMs > 10 * 60 * 1000) await rm(full, { recursive: true, force: true }).catch(() => undefined);
      }),
  );
}

async function freeTmpBytes(): Promise<number> {
  try {
    const st = await statfs(tmpdir());
    return Number(st.bavail) * Number(st.bsize);
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

type Run = { code: number | null; stdout: string; stderr: string };

function runBin(bin: string, args: string[], cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<Run> {
  return new Promise((resolve, reject) => {
    if (timeoutMs <= 1000) {
      reject(new Error("DOWNLOAD_TIMEOUT"));
      return;
    }
    const child = spawn(bin, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, HOME: tmpdir(), PYTHONWARNINGS: "ignore" } });
    const jobId = currentJobId();
    if (jobId) setJobChild(jobId, child);
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("DOWNLOAD_CANCELLED")));
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("DOWNLOAD_TIMEOUT")));
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (c: Buffer) => {
      if (stdout.length < 2_000_000) stdout += c.toString("utf8");
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString("utf8")).slice(-4000);
    });
    child.on("error", () => finish(() => reject(new Error("DOWNLOAD_FAILED_SPAWN"))));
    child.on("close", (code) => finish(() => resolve({ code, stdout, stderr })));
  });
}

function remaining(deadline: number): number {
  return deadline - Date.now();
}

/** Short, user-safe reason from yt-dlp stderr (never includes headers/cookies). */
export function ytdlpReason(stderr: string): string {
  const line = stderr.split("\n").reverse().find((l) => /ERROR:/.test(l)) ?? "";
  if (/not a bot|sign in to confirm/i.test(line)) return "BLOCKED_BOT_CHECK";
  if (/log(ged)?[- ]?in|authentication|cookies|private/i.test(line)) return "LOGIN_REQUIRED";
  if (/unsupported url/i.test(line)) return "UNSUPPORTED";
  if (/no video|no media|no formats|not find any video/i.test(line)) return "NO_VIDEO";
  if (/geo|country|not available in your/i.test(line)) return "GEO_BLOCKED";
  if (/404|not found|removed|deleted|unavailable/i.test(line)) return "GONE";
  if (/larger than max-filesize|file is larger/i.test(line)) return "FILE_TOO_LARGE";
  return "DOWNLOAD_FAILED";
}

export function formatSelector(hasFfmpeg: boolean): string {
  const cap = Math.floor((uploadCapBytes() / (1024 * 1024)) * 0.95);
  const v = Math.floor(cap * 0.85);
  // Fit one Telegram file when sizes are known; otherwise prefer ≤480p (phones) so long
  // clips stay small; splitting into parts is the last resort.
  return hasFfmpeg
    ? [
        `b[filesize<${cap}M]`,
        `b[filesize_approx<${cap}M]`,
        `bv*[height<=720][filesize<${v}M]+ba`,
        `bv*[height<=720][filesize_approx<${v}M]+ba`,
        "bv*[height<=480]+ba",
        "b[height<=480]",
        "bv*[height<=720]+ba",
        "b[height<=720]",
        "bv*+ba",
        "b",
      ].join("/")
    : `b[filesize<${cap}M]/b[filesize_approx<${cap}M]/b[height<=480]/b[height<=720]/b`;
}

export function buildFileArgs(opts: { target: string; dir: string; ffmpeg: string | null; referer?: string }): string[] {
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--restrict-filenames",
    "--no-mtime",
    "--max-filesize",
    `${Math.floor(MAX_SOURCE_BYTES / (1024 * 1024))}M`,
    "--concurrent-fragments",
    "4",
    "-f",
    formatSelector(Boolean(opts.ffmpeg)),
    "-S",
    "vcodec:h264,acodec:aac",
    "--print",
    "after_move:%(.{filepath,title,extractor,duration,width,height,thumbnail,vcodec})j",
    "--no-simulate",
    "-o",
    join(opts.dir, "media.%(ext)s"),
  ];
  if (opts.ffmpeg) args.push("--ffmpeg-location", opts.ffmpeg, "--merge-output-format", "mp4", "--remux-video", "mp4/mkv>mp4/mov>mp4");
  if (opts.referer) args.push("--referer", opts.referer);
  args.push(...ytDlpNetworkArgs(), "--", opts.target);
  return args;
}

type Printed = {
  filepath?: string;
  title?: string;
  extractor?: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  vcodec?: string;
};

async function ytdlpFile(
  target: string,
  dir: string,
  ffmpeg: string | null,
  deadline: number,
  referer: string | undefined,
  signal?: AbortSignal,
): Promise<{ file: string; size: number; meta: Printed }> {
  await assertSafeOutboundUrl(target);
  const bin = await ensureYtDlp();
  const args = buildFileArgs({ target, dir, ffmpeg, referer });
  let run = await runBin(bin, args, dir, Math.min(remaining(deadline), 240_000), signal);
  // Cloudflare JS challenge: yt-dlp can retry with browser TLS impersonation (bundled curl_cffi, free).
  if (run.code !== 0 && /Cloudflare anti-bot/i.test(run.stderr) && remaining(deadline) > 20_000) {
    const retry = await runBin(bin, ["--extractor-args", "generic:impersonate", ...args], dir, Math.min(remaining(deadline), 120_000), signal);
    if (retry.code === 0 || !/Cloudflare anti-bot/i.test(retry.stderr)) run = retry;
  }
  if (run.code !== 0) {
    const e = new Error(ytdlpReason(run.stderr)) as Error & { detail?: string };
    e.detail = (run.stderr.split("\n").reverse().find((l) => /ERROR:/.test(l)) ?? `exit ${run.code}`).slice(0, 200);
    throw e;
  }
  const line = run.stdout.trim().split("\n").reverse().find((l) => l.startsWith("{"));
  let meta: Printed = {};
  try {
    meta = line ? (JSON.parse(line) as Printed) : {};
  } catch {
    meta = {};
  }
  let file = meta.filepath && meta.filepath.startsWith(dir) ? meta.filepath : "";
  if (!file) {
    const names = (await readdir(dir)).filter((n) => n.startsWith("media.") && !n.endsWith(".part"));
    if (names[0]) file = join(dir, names[0]);
  }
  if (!file) throw new Error("NO_VIDEO");
  const size = (await stat(file)).size;
  if (size < 1024) throw new Error("NO_VIDEO");
  return { file, size, meta };
}

async function probeDuration(ffmpeg: string, file: string, dir: string): Promise<number | undefined> {
  const run = await runBin(ffmpeg, ["-hide_banner", "-i", file], dir, 20_000).catch(() => null);
  const m = run?.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Split an oversize file into Telegram-sized parts with a fast stream copy (no re-encode). */
export async function splitForTelegram(
  ffmpeg: string,
  file: string,
  size: number,
  duration: number,
  dir: string,
  deadline: number,
): Promise<UniversalPart[]> {
  const cap = uploadCapBytes();
  const ext = file.split(".").pop() || "mp4";
  let ratio = PART_TARGET_RATIO;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const segment = Math.max(5, Math.floor((duration * (cap * ratio)) / size));
    const partsDir = await mkdtemp(join(dir, "parts-"));
    const run = await runBin(
      ffmpeg,
      ["-hide_banner", "-loglevel", "error", "-y", "-i", file, "-map", "0", "-c", "copy", "-f", "segment", "-segment_time", String(segment), "-reset_timestamps", "1", ...(ext === "mp4" ? ["-segment_format_options", "movflags=+faststart"] : []), join(partsDir, `part%02d.${ext}`)],
      dir,
      Math.min(remaining(deadline), 90_000),
    );
    if (run.code !== 0) throw new Error("SPLIT_FAILED");
    const names = (await readdir(partsDir)).filter((n) => n.startsWith("part")).sort();
    const parts = await Promise.all(names.map(async (n) => ({ path: join(partsDir, n), size: (await stat(join(partsDir, n))).size })));
    if (parts.length > MAX_PARTS) throw new Error("FILE_TOO_LARGE");
    if (parts.length && parts.every((p) => p.size <= cap)) return parts;
    ratio *= 0.7;
  }
  throw new Error("FILE_TOO_LARGE");
}

export async function universalDownload(url: string, opts: UniversalOptions = {}): Promise<UniversalDownload> {
  const deadline = opts.deadline ?? Date.now() + 200_000;
  await assertSafeOutboundUrl(url);
  await opts.guard?.(url);
  const release = await acquireSlot(deadline);
  await sweepTmp();
  if ((await freeTmpBytes()) < MIN_FREE_TMP_BYTES) {
    release();
    // Retryable: the queue re-runs it shortly (possibly on another instance).
    throw new Error("DOWNLOAD_TIMEOUT storage temporarily full");
  }
  let dir: string;
  try {
    dir = await mkdtemp(join(tmpdir(), `barq-u-${randomBytes(5).toString("hex")}-`));
  } catch (err) {
    release();
    throw err;
  }
  let released = false;
  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    if (!released) {
      released = true;
      release();
    }
  };
  try {
    const [ytReady, ffmpeg] = await Promise.all([
      ensureYtDlp(),
      ensureFfmpeg().catch(() => null),
    ]);
    void ytReady;
    const reasons: string[] = [];
    const details: string[] = [];
    let got: { file: string; size: number; meta: Printed } | null = null;
    let mediaUrl = url;
    let via: UniversalDownload["via"] = "ytdlp";
    let pageTitleText: string | undefined;

    const attempt = async (target: string, referer?: string) => {
      try {
        if (target !== url) {
          await opts.guard?.(target);
        }
        const res = await ytdlpFile(target, dir, ffmpeg, deadline, referer, opts.signal);
        return res;
      } catch (err) {
        if (err instanceof SsrfError) return null;
        const msg = err instanceof Error ? err.message : "DOWNLOAD_FAILED";
        if (err instanceof MediaBlockedError) throw err;
        if (msg === "DOWNLOAD_CANCELLED") throw err;
        reasons.push(msg);
        const detail = (err as { detail?: string }).detail;
        if (detail) details.push(detail);
        return null;
      }
    };

    got = await attempt(url);

    if (!got && remaining(deadline) > 15_000) {
      const tried = new Set<string>([url]);
      let firstPage: PageSource | null = null;
      for await (const page of (opts.pages ?? pageSources)(url, deadline)) {
        pageTitleText = pageTitleText ?? pageTitle(page.html);
        const candidates: MediaCandidate[] = pageMediaCandidates(page.html, page.finalUrl);
        for (const link of oembedLinks(page.html, page.finalUrl)) {
          try {
            const { text } = await fetchText(link, undefined, 6000);
            const src = iframeFromOembed(JSON.parse(text), page.finalUrl);
            if (src && !candidates.some((c) => c.url === src)) {
              const at = candidates.findIndex((c) => c.type === "embed");
              candidates.splice(at < 0 ? candidates.length : at, 0, { url: src, type: "embed", source: "oembed" });
            }
          } catch {
            /* oEmbed is optional */
          }
        }
        const fresh = candidates.filter((c) => !tried.has(c.url)).slice(0, 5);
        for (const c of fresh) {
          if (remaining(deadline) < 15_000) break;
          tried.add(c.url);
          got = await attempt(c.url, page.finalUrl);
          if (got) {
            mediaUrl = c.url;
            via = page.via === "direct" ? "page" : page.via;
            break;
          }
        }
        if (got) break;
        firstPage = firstPage ?? page;
        if (remaining(deadline) < 15_000) break;
      }
      // Last resort: Grok picks from real URLs on the first readable page.
      if (!got && firstPage && remaining(deadline) > 20_000) {
        const pool = pageUrlPool(firstPage.html, firstPage.finalUrl).filter((u) => !tried.has(u));
        const pick = opts.pickWithAi ?? (await import("../bot/grok.server")).grokPickMediaUrl;
        const chosen = await pick(firstPage.finalUrl, pageTitleText, pool).catch(() => null);
        if (chosen) {
          tried.add(chosen);
          got = await attempt(chosen, firstPage.finalUrl);
          if (got) {
            mediaUrl = chosen;
            via = "ai";
          }
        }
      }
    }

    if (!got) {
      const order = ["FILE_TOO_LARGE", "GONE", "LOGIN_REQUIRED", "BLOCKED_BOT_CHECK", "GEO_BLOCKED", "NO_VIDEO", "UNSUPPORTED"];
      // The link's own answer wins when it is specific; otherwise the most telling candidate error.
      const own = reasons[0];
      const best =
        own && own !== "DOWNLOAD_FAILED" && own !== "UNSUPPORTED" && own !== "NO_VIDEO"
          ? own
          : (order.find((r) => reasons.includes(r)) ?? own ?? "NO_VIDEO");
      const e = new Error(`UNIVERSAL_${best}`) as Error & { detail?: string };
      e.detail = details.join(" | ").slice(0, 400);
      throw e;
    }

    const meta = got.meta;
    const kind: UniversalDownload["kind"] = meta.vcodec === "none" || /\.(m4a|mp3|aac|ogg|opus|wav|flac)$/i.test(got.file) ? "audio" : "video";
    let parts: UniversalPart[] = [{ path: got.file, size: got.size }];
    if (got.size > uploadCapBytes()) {
      if (!ffmpeg) throw new Error("UNIVERSAL_FILE_TOO_LARGE");
      const duration = meta.duration || (await probeDuration(ffmpeg, got.file, dir));
      if (!duration) throw new Error("UNIVERSAL_FILE_TOO_LARGE");
      parts = await splitForTelegram(ffmpeg, got.file, got.size, duration, dir, deadline);
    }
    return {
      kind,
      title: (meta.title && !/^(HLSPlaylist|DASH_\w+|CMAF_\w+|master|index|playlist|videoplayback)$/i.test(meta.title) ? meta.title : undefined) || pageTitleText || meta.title,
      extractor: meta.extractor,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      thumbnail: meta.thumbnail,
      mediaUrl,
      via,
      parts,
      cleanup,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/** Arabic, user-facing text for a UNIVERSAL_* failure code. Timeouts stay raw so the queue can retry. */
export function universalUserError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const code = msg.replace(/^UNIVERSAL_/, "");
  if (/DOWNLOAD_TIMEOUT|DOWNLOAD_CANCELLED/.test(code)) return err instanceof Error ? err : new Error(code);
  if (code === "FILE_TOO_LARGE") return new Error("المقطع أكبر من حد تليجرام (حوالي 50 ميغا) حتى بعد التقسيم. أرسل رابط مقطع أقصر.");
  if (code === "GONE") return new Error("الفيديو محذوف أو غير متاح.");
  if (code === "GEO_BLOCKED") return new Error("تعذر تحميل هذا المقطع: غير متاح في منطقة خادم برق.");
  if (code === "LOGIN_REQUIRED" || code === "BLOCKED_BOT_CHECK") {
    return new Error("تعذر تحميل هذا المقطع: الموقع يطلب تسجيل دخول أو يحجب خوادم التحميل حاليًا.");
  }
  return new Error("ما لقيت فيديو قابل للتحميل في هذا الرابط.");
}

/** Extract errors that are final answers (policy, wrong link type) — do not try the universal pipeline. */
export function isFinalExtractError(err: unknown): boolean {
  if (err instanceof MediaBlockedError || err instanceof SsrfError) return true;
  const msg = err instanceof Error ? err.message : "";
  return /هذا رابط|قناة|بث مباشر|رابط مختصر|محظور|ممنوع|cancelled/.test(msg);
}
