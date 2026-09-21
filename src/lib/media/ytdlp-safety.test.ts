import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, test } from "node:test";
import type { ChildProcess } from "node:child_process";
import {
  assertSafeDir,
  assertSafeOutputPath,
  buildYtDlpArgs,
  resetYtDlpSpawn,
  sanitizeYtDlpExtraArgs,
  setYtDlpSpawn,
  spawnYtDlp,
} from "./ytdlp.ts";

afterEach(() => {
  resetYtDlpSpawn();
});

test("yt-dlp is spawned with argv, never a shell string", () => {
  const src = readFileSync(new URL("./ytdlp.ts", import.meta.url), "utf8");
  assert.equal(/exec\s*\(\s*[`'"]/.test(src), false);
  assert.equal(/execFile\s*\(\s*[`'"]yt-dlp \$\{/.test(src), false);
  assert.match(src, /(?:spawn|spawnImpl)\(\s*"yt-dlp"/);
  assert.match(src, /shell:\s*false/);
  assert.match(src, /--no-playlist/);
  assert.match(src, /--restrict-filenames/);
  assert.match(src, /--max-filesize/);
  assert.match(src, /maxFilesizeFlag/);
  assert.match(src, /TELEGRAM_CLOUD_MAX_MB/);
  assert.match(src, /assertSafeOutboundUrl/);
  assert.match(src, /DOWNLOAD_TIMEOUT_CAP_MS/);
  assert.match(src, /maxDuration/);
  assert.match(src, /Math\.min\([^)]*DOWNLOAD_TIMEOUT_CAP_MS\)/);
});

test("shell metacharacters in a URL stay after -- and never become extra argv", () => {
  const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ; rm -rf /";
  const outputPath = join(tmpdir(), "barq-out.mp4");
  const args = buildYtDlpArgs({
    url,
    outputPath,
    extraArgs: ["; rm -rf /", "--exec", "rm -rf /", "-o", "/etc/passwd", "--", "https://evil.example/"],
  });
  const sep = args.lastIndexOf("--");
  assert.ok(sep >= 0);
  assert.equal(args[sep + 1], url);
  assert.equal(args.slice(sep + 2).length, 0);
  const before = args.slice(0, sep);
  assert.equal(before.includes("; rm -rf /"), false);
  assert.equal(
    before.some((a) => a.includes("rm -rf")),
    false,
  );
  assert.equal(before.includes("--exec"), false);
  assert.equal(before.includes("/etc/passwd"), false);
  assert.equal(before.filter((a) => a === "--").length, 0);
});

test("command injection attempt in URL does not become extra argv", () => {
  const out = join(tmpdir(), "clip.mp4");
  const payloads = [
    "https://example.com/watch?v=1 --exec calc",
    "https://example.com/; rm -rf /",
    "https://example.com/`id`",
    "https://example.com/$(reboot)",
    "https://example.com/a && cat /etc/passwd",
    "https://example.com/ --output /etc/cron.d/pwn --max-filesize 9G",
  ];
  for (const url of payloads) {
    const args = buildYtDlpArgs({ url, outputPath: out });
    assert.equal(args[args.length - 1], url, url);
    assert.equal(args[args.length - 2], "--");
    assert.equal(args.includes("--exec"), false, url);
    assert.equal(args.includes("-rf"), false, url);
    assert.equal(args.filter((a) => a === "--max-filesize").length, 1, url);
    const flagAt = args.indexOf("--max-filesize");
    assert.equal(args[flagAt + 1], "50M", url);
    assert.ok(args.includes("--no-playlist"));
    assert.ok(args.includes("--restrict-filenames"));
  }
});

test("extraArgs allowlist drops user flags; extractor-args still pass", () => {
  assert.deepEqual(sanitizeYtDlpExtraArgs(["; rm -rf /"]), []);
  assert.deepEqual(sanitizeYtDlpExtraArgs(["--exec", "rm -rf /"]), []);
  assert.deepEqual(sanitizeYtDlpExtraArgs(["-o", "/tmp/pwned"]), []);
  assert.deepEqual(sanitizeYtDlpExtraArgs(["--output", "%(id)s"]), []);
  assert.deepEqual(
    sanitizeYtDlpExtraArgs(["--extractor-args", "youtube:player_client=android,android_vr"]),
    ["--extractor-args", "youtube:player_client=android,android_vr"],
  );
  const args = buildYtDlpArgs({
    url: "https://youtu.be/aaaaaaaaaaa",
    outputPath: join(tmpdir(), "x.%(ext)s"),
    extraArgs: ["--extractor-args", "youtube:player_client=ios,tv"],
  });
  const sep = args.lastIndexOf("--");
  assert.equal(args[sep + 1], "https://youtu.be/aaaaaaaaaaa");
  assert.ok(args.slice(0, sep).includes("--extractor-args"));
});

test("playlist dump uses a capped --playlist-end and still isolates the URL", () => {
  const url = "https://www.youtube.com/playlist?list=PLabcdefghijklmnopqrstuv";
  const args = buildYtDlpArgs({
    url,
    outputPath: join(tmpdir(), "x.%(ext)s"),
    dumpJson: true,
    playlistEnd: 99,
  });
  const sep = args.lastIndexOf("--");
  assert.equal(args[sep + 1], url);
  assert.ok(args.includes("--yes-playlist"));
  assert.ok(args.includes("--flat-playlist"));
  assert.equal(args[args.indexOf("--playlist-end") + 1], "5");
  assert.equal(args.includes("--no-playlist"), false);
});

test("path traversal in output dir is rejected", () => {
  assert.throws(() => assertSafeOutputPath("../../etc/passwd"), /invalid output path/);
  assert.throws(() => assertSafeOutputPath("/etc/passwd"), /invalid output path/);
  assert.throws(() => assertSafeOutputPath(join(tmpdir(), "..", "etc", "passwd")), /invalid output path/);
  assert.throws(() => assertSafeDir("../../etc"), /invalid output path/);
  assert.throws(() => assertSafeDir("/etc"), /invalid output path/);
  const safe = assertSafeOutputPath(join(tmpdir(), "barq-clip.mp4"));
  assert.ok(safe.endsWith("barq-clip.mp4"));
});

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed: NodeJS.Signals | number | null = null;
  pid = 4242;
  kill = (sig?: NodeJS.Signals | number) => {
    this.killed = sig ?? "SIGTERM";
    queueMicrotask(() => this.emit("close", 1));
    return true;
  };
}

test("process is killed on timeout", async () => {
  const box: { child: FakeChild | null } = { child: null };
  setYtDlpSpawn(() => {
    box.child = new FakeChild();
    return box.child as unknown as ChildProcess;
  });
  await assert.rejects(() => spawnYtDlp(["--version"], tmpdir(), 25), /DOWNLOAD_TIMEOUT/);
  assert.equal(box.child?.killed, "SIGKILL");
});

test("process is killed on cancel", async () => {
  const box: { child: FakeChild | null } = { child: null };
  setYtDlpSpawn(() => {
    box.child = new FakeChild();
    return box.child as unknown as ChildProcess;
  });
  const ac = new AbortController();
  const pending = spawnYtDlp(["--version"], tmpdir(), 30_000, ac.signal);
  ac.abort();
  await assert.rejects(() => pending, /DOWNLOAD_CANCELLED/);
  assert.equal(box.child?.killed, "SIGKILL");
});
