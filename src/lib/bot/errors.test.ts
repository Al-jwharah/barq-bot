import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  errorCodeFromMessage,
  leaksTechnical,
  publicError,
  userError,
} from "./errors.ts";

test("all required error codes exist with Arabic copy", () => {
  const need: typeof ERROR_CODES = [
    "INVALID_URL",
    "PRIVATE_CONTENT",
    "UNSUPPORTED_PLATFORM",
    "FILE_TOO_LARGE",
    "DOWNLOAD_TIMEOUT",
    "SOURCE_UNAVAILABLE",
    "RATE_LIMITED",
    "SYSTEM_BUSY",
    "JOB_CANCELLED",
    "UNKNOWN_ERROR",
  ];
  for (const code of need) {
    assert.equal(ERROR_CODES.includes(code), true, code);
    const msg = ERROR_MESSAGES[code];
    assert.ok(msg.length > 8, code);
    assert.match(msg, /[\u0600-\u06FF]/, code);
    assert.equal(leaksTechnical(msg), false, code);
  }
});

test("invalid url -> INVALID_URL", () => {
  assert.equal(errorCodeFromMessage("invalid url"), "INVALID_URL");
});

test("private video -> PRIVATE_CONTENT", () => {
  assert.equal(errorCodeFromMessage("private video"), "PRIVATE_CONTENT");
});

test("timeout -> DOWNLOAD_TIMEOUT", () => {
  assert.equal(errorCodeFromMessage("timeout"), "DOWNLOAD_TIMEOUT");
});

test("50mb -> FILE_TOO_LARGE", () => {
  assert.equal(errorCodeFromMessage("50mb"), "FILE_TOO_LARGE");
});

test("unknown xyz -> UNKNOWN_ERROR", () => {
  assert.equal(errorCodeFromMessage("unknown xyz"), "UNKNOWN_ERROR");
});

test("maps remaining codes", () => {
  assert.equal(errorCodeFromMessage("unsupported platform"), "UNSUPPORTED_PLATFORM");
  assert.equal(errorCodeFromMessage("source unavailable 503"), "SOURCE_UNAVAILABLE");
  assert.equal(errorCodeFromMessage("rate limit 429"), "RATE_LIMITED");
  assert.equal(errorCodeFromMessage("system_busy queue full"), "SYSTEM_BUSY");
  assert.equal(errorCodeFromMessage("job cancelled by user"), "JOB_CANCELLED");
});

test("RATE_LIMITED includes retryAfter seconds", () => {
  const msg = userError("429 too many", 42);
  assert.match(msg, /42/);
  assert.match(msg, /ثانية/);
  assert.equal(msg.includes("429"), false);
});

test("userError never contains ECONN or at /workspace", () => {
  const samples = [
    "ECONNRESET connection failed",
    "ECONNREFUSED at /workspace/src/lib/bot/errors.ts:12",
    "network error ECONN at /workspace",
    "unknown xyz",
    "timeout ETIMEDOUT at /workspace/worker.ts",
    "invalid url",
    "private video",
    "50mb file too large",
  ];
  for (const raw of samples) {
    const msg = userError(raw);
    assert.equal(msg.includes("ECONN"), false, `leaked ECONN for: ${raw}`);
    assert.equal(msg.includes("at /workspace"), false, `leaked path for: ${raw}`);
  }
});

test("never leaks stack, sql, paths, yt-dlp, or keys", () => {
  const dirty = [
    "ERROR: [yt-dlp] HTTP Error 403",
    "relation \"usage_counters\" does not exist",
    "at runOnce (/workspace/src/lib/jobs/worker.server.ts:40:11)",
    "password=secret DATABASE_URL=postgres://x",
    "Authorization Bearer sk-abcdefghijklmnopqrstuvwxyz",
    new Error("boom\n    at chat (grok.server.ts:80:3)"),
  ];
  for (const raw of dirty) {
    const msg = typeof raw === "string" ? userError(raw) : publicError(raw);
    assert.equal(leaksTechnical(msg), false, msg);
    assert.equal(msg.includes("yt-dlp"), false, msg);
    assert.equal(msg.includes("/workspace"), false, msg);
    assert.equal(msg.toLowerCase().includes("postgres"), false, msg);
    assert.equal(msg.includes("sk-"), false, msg);
    assert.equal(msg.includes("Bearer"), false, msg);
  }
});
