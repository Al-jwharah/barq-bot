import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FFMPEG = "/usr/local/bin/ffmpeg";
const MARK = join(process.cwd(), "public/watermark.png");

function run(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("انتهت مهلة الشعار"));
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

export async function stampMedia(blob: Blob, kind: "video" | "photo"): Promise<Blob> {
  const dir = await mkdtemp(join(tmpdir(), "barqwm-"));
  try {
    const ext = kind === "photo" ? "jpg" : "mp4";
    const input = join(dir, `in.${ext}`);
    const output = join(dir, `out.${ext}`);
    await writeFile(input, Buffer.from(await blob.arrayBuffer()));
    if (kind === "photo") {
      await run(
        [
          "-y",
          "-i",
          input,
          "-i",
          MARK,
          "-filter_complex",
          "[1:v]scale=160:-1[wm];[0:v][wm]overlay=W-w-14:H-h-14",
          "-q:v",
          "3",
          output,
        ],
        12000,
      );
      const buf = await readFile(output);
      return new Blob([buf], { type: "image/jpeg" });
    }
    try {
      await run(
        [
          "-y",
          "-i",
          input,
          "-i",
          MARK,
          "-filter_complex",
          "[1:v]format=rgba,scale=180:-1[wm];[0:v][wm]overlay=W-w-18:H-h-18:format=auto,format=yuv420p",
          "-map",
          "0:v:0",
          "-map",
          "0:a?",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          "-threads",
          "4",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          output,
        ],
        40000,
      );
    } catch {
      await run(
        [
          "-y",
          "-i",
          input,
          "-i",
          MARK,
          "-filter_complex",
          "[1:v]format=rgba,scale=180:-1[wm];[0:v][wm]overlay=W-w-18:H-h-18:format=auto,format=yuv420p",
          "-map",
          "0:v:0",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          "-threads",
          "4",
          "-an",
          "-movflags",
          "+faststart",
          output,
        ],
        40000,
      );
    }
    const buf = await readFile(output);
    return new Blob([buf], { type: "video/mp4" });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
