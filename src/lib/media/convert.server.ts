import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FFMPEG = process.env.FFMPEG_PATH?.trim() || "/usr/local/bin/ffmpeg";

function run(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
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
      else reject(new Error(err.slice(-240) || `ffmpeg ${code}`));
    });
  });
}

async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "barqcv-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
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
