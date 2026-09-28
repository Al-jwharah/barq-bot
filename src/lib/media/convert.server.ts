import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const FFMPEG = process.env.FFMPEG_PATH?.trim() || "/usr/local/bin/ffmpeg";
const FFMPEG_URL =
  "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz";
const CACHED = join(tmpdir(), "barq-ffmpeg");

function bundledFfmpeg(): string | null {
  try {
    const bundled = createRequire(import.meta.url)("ffmpeg-static") as string | null;
    if (bundled && existsSync(bundled)) return bundled;
  } catch {
    /* not installed in this bundle */
  }
  return null;
}

async function ensureFfmpeg(): Promise<string> {
  if (existsSync(FFMPEG)) return FFMPEG;
  const bundled = bundledFfmpeg();
  if (bundled) return bundled;
  if (existsSync(CACHED)) return CACHED;
  const res = await fetch(FFMPEG_URL);
  if (!res.ok) throw new Error("تعذر تجهيز أداة التحويل");
  const gz = Buffer.from(await res.arrayBuffer());
  const bin = gunzipSync(gz);
  await writeFile(CACHED, bin);
  await chmod(CACHED, 0o755);
  return CACHED;
}

function run(args: string[], timeoutMs: number): Promise<void> {
  return ensureFfmpeg().then(
    (bin) =>
      new Promise((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
        let err = "";
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("انتهت مهلة التحويل"));
        }, timeoutMs);
        child.stderr?.on("data", (chunk) => {
          err += String(chunk);
          if (err.length > 2000) err = err.slice(-2000);
        });
        child.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(err.slice(-240) || `تحويل ${code}`));
        });
      }),
  );
}

async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "barqcv-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function audioWithCoverToMp4(
  audio: Buffer,
  cover: Buffer | null,
  timeoutMs = 90000,
): Promise<Blob> {
  return withTemp(async (dir) => {
    const sound = join(dir, "audio.bin");
    const output = join(dir, "out.mp4");
    await writeFile(sound, audio);
    const args = ["-y"];
    if (cover && cover.length > 32) {
      const image = join(dir, "cover.jpg");
      await writeFile(image, cover);
      args.push("-loop", "1", "-framerate", "25", "-i", image);
    } else {
      args.push("-f", "lavfi", "-i", "color=c=0x111111:s=720x720:r=25");
    }
    args.push(
      "-i",
      sound,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-tune",
      "stillimage",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "25",
      "-vf",
      "scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
      "-c:a",
      "aac",
      "-profile:a",
      "aac_low",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-b:a",
      "160k",
      "-shortest",
      "-movflags",
      "+faststart",
      output,
    );
    await run(args, timeoutMs);
    return new Blob([await readFile(output)], { type: "video/mp4" });
  });
}

export async function clipBuffer(input: Buffer, startSec: number, endSec: number, timeoutMs = 70000): Promise<Blob> {
  return withTemp(async (dir) => {
    const source = join(dir, "in.bin");
    const output = join(dir, "clip.mp4");
    await writeFile(source, input);
    await run(
      [
        "-y",
        "-ss",
        String(startSec),
        "-to",
        String(endSec),
        "-i",
        source,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        output,
      ],
      timeoutMs,
    );
    return new Blob([await readFile(output)], { type: "video/mp4" });
  });
}

export async function blobToMp3(blob: Blob, timeoutMs = 45000): Promise<Blob> {
  return withTemp(async (dir) => {
    const input = join(dir, "in.bin");
    const mp3 = join(dir, "out.mp3");
    const m4a = join(dir, "out.m4a");
    await writeFile(input, Buffer.from(await blob.arrayBuffer()));
    try {
      await run(["-y", "-i", input, "-vn", "-c:a", "libmp3lame", "-q:a", "4", mp3], timeoutMs);
      return new Blob([await readFile(mp3)], { type: "audio/mpeg" });
    } catch {
      await run(["-y", "-i", input, "-vn", "-c:a", "aac", "-b:a", "128k", m4a], timeoutMs);
      return new Blob([await readFile(m4a)], { type: "audio/mp4" });
    }
  });
}

export async function blobToMp4(blob: Blob, timeoutMs = 50000): Promise<Blob> {
  return withTemp(async (dir) => {
    const input = join(dir, "in.bin");
    const output = join(dir, "out.mp4");
    await writeFile(input, Buffer.from(await blob.arrayBuffer()));
    await run(
      [
        "-y",
        "-i",
        input,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-threads",
        "4",
        output,
      ],
      timeoutMs,
    );
    return new Blob([await readFile(output)], { type: "video/mp4" });
  });
}

export function needsMp4Remux(contentType?: string, url?: string): boolean {
  const t = (contentType ?? "").toLowerCase();
  const u = (url ?? "").toLowerCase();
  return t.includes("webm") || /\.webm(\?|$)/.test(u);
}
