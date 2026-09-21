import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isRetryableError,
  isTerminalError,
  retryDelayMs,
  shouldRetry,
  userFailMessage,
  userRetryMessage,
} from "./retry-policy.ts";

test("retries timeouts, network, telegram 5xx, storage, and provider temp", () => {
  for (const msg of [
    "connect ETIMEDOUT",
    "socket hang up",
    "Telegram 502 Bad Gateway",
    "fetch failed",
    "blob storage temporarily unavailable",
    "HTTP 503",
    "provider temp",
    "provider temporarily unavailable",
    "DOWNLOAD_TIMEOUT",
  ]) {
    assert.equal(isRetryableError(msg), true, msg);
    assert.equal(shouldRetry(msg, 1), true, msg);
  }
});

test("does not retry terminal errors", () => {
  for (const msg of [
    "invalid url",
    "This video is private",
    "المنصة غير مدعومة",
    "nsfw blocked",
    "payload too large 50mb",
    "expired link",
    "this link has expired",
    "unsupported platform",
  ]) {
    assert.equal(isTerminalError(msg), true, msg);
    assert.equal(isRetryableError(msg), false, msg);
    assert.equal(shouldRetry(msg, 1), false, msg);
  }
});

test("stops after 3 attempts even if retryable", () => {
  assert.equal(shouldRetry("ETIMEDOUT", 1), true);
  assert.equal(shouldRetry("ETIMEDOUT", 2), true);
  assert.equal(shouldRetry("ETIMEDOUT", 3), false);
});

test("exponential backoff is 5s then 30s then 120s", () => {
  assert.equal(retryDelayMs(1), 5_000);
  assert.equal(retryDelayMs(2), 30_000);
  assert.equal(retryDelayMs(3), 120_000);
});

test("user messages never include a stack trace", () => {
  const stacked = "Error: boom\n    at runOnce (worker.server.ts:40:11)";
  const msg = userFailMessage(stacked);
  assert.equal(msg.includes("worker.server.ts"), false);
  assert.equal(msg.includes("at runOnce"), false);
  assert.equal(userFailMessage("This video is private"), "هذا الفيديو خاص ولا يمكن تحميله.");
  assert.equal(userFailMessage("expired link").includes("انتهت"), true);
  assert.match(userFailMessage("ما قدرت أحمّل فيديو تيك توك. أرسل الرابط الكامل من التطبيق."), /تيك توك/);
  assert.equal(userFailMessage("HTTP 429").includes("كثيرة"), false);
  assert.equal(userRetryMessage(1, 3).includes("مشغولة"), false);
  assert.equal(userFailMessage("too many redirects").includes("المصدر"), false);
  assert.match(userFailMessage("DOWNLOAD_FAILED_SPAWN"), /تعذر إرسال الملف/);
  assert.match(userFailMessage("حجم الملف أكبر من الحد المسموح به."), /تليجرام/);
});
