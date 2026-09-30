import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFileArgs, formatSelector, isFinalExtractError, splitForTelegram, universalUserError, ytdlpReason } from "./universal.server";
import { MediaBlockedError } from "../bot/safety";

test("yt-dlp file args: fixed flags, URL after --, no user flags", () => {
  const args = buildFileArgs({ target: "https://site.example/v/1", dir: "/tmp/x", ffmpeg: "/tmp/ff", referer: "https://site.example/p" });
  assert.equal(args[args.length - 2], "--");
  assert.equal(args[args.length - 1], "https://site.example/v/1");
  assert.ok(args.includes("--no-playlist"));
  assert.ok(args.includes("--ffmpeg-location"));
  assert.equal(args[args.indexOf("--referer") + 1], "https://site.example/p");
  const noFf = buildFileArgs({ target: "https://site.example/v/1", dir: "/tmp/x", ffmpeg: null });
  assert.ok(!noFf.includes("--merge-output-format"));
});

test("format selector prefers a single file under the Telegram cap", () => {
  assert.match(formatSelector(true), /^b\[filesize<\d+M\]/);
  assert.ok(!formatSelector(false).includes("+ba"));
});

test("stderr reasons are coarse codes", () => {
  assert.equal(ytdlpReason("ERROR: [youtube] x: Sign in to confirm you’re not a bot"), "BLOCKED_BOT_CHECK");
  assert.equal(ytdlpReason("ERROR: [Reddit] x: Account authentication is required"), "LOGIN_REQUIRED");
  assert.equal(ytdlpReason("ERROR: Unsupported URL: https://a.b"), "UNSUPPORTED");
  assert.equal(ytdlpReason("ERROR: [dailymotion] x: No video formats found!"), "NO_VIDEO");
});

test("user errors are Arabic; timeouts stay retryable", () => {
  assert.match(universalUserError(new Error("UNIVERSAL_LOGIN_REQUIRED")).message, /^تعذر /);
  assert.match(universalUserError(new Error("UNIVERSAL_FILE_TOO_LARGE")).message, /أكبر من حد/);
  assert.equal(universalUserError(new Error("DOWNLOAD_TIMEOUT")).message, "DOWNLOAD_TIMEOUT");
});

test("policy blocks and wrong link types never fall through to the universal pipeline", () => {
  assert.equal(isFinalExtractError(new MediaBlockedError("x", "e", "nsfw")), true);
  assert.equal(isFinalExtractError(new Error("هذا رابط قناة أو اشتراك")), true);
  assert.equal(isFinalExtractError(new Error("DOWNLOAD_FAILED_1")), false);
});

const ffmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 ? "ffmpeg" : null;

test("oversize video is split by stream copy into parts under the cap", { skip: !ffmpeg }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "barq-split-"));
  const prev = process.env.TELEGRAM_CLOUD_MAX_MB;
  process.env.TELEGRAM_CLOUD_MAX_MB = "2";
  try {
    const src = join(dir, "in.mp4");
    const gen = spawnSync(ffmpeg!, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25", "-t", "12", "-c:v", "libx264", "-b:v", "1500k", "-g", "25", "-pix_fmt", "yuv420p", "-y", src]);
    assert.equal(gen.status, 0);
    const size = statSync(src).size;
    assert.ok(size > 2 * 1024 * 1024, `fixture ${size}`);
    const parts = await splitForTelegram(ffmpeg!, src, size, 12, dir, Date.now() + 60_000);
    assert.ok(parts.length >= 2);
    for (const p of parts) assert.ok(p.size <= 2 * 1024 * 1024, `part ${p.size}`);
  } finally {
    if (prev == null) delete process.env.TELEGRAM_CLOUD_MAX_MB;
    else process.env.TELEGRAM_CLOUD_MAX_MB = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
