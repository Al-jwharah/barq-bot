import assert from "node:assert/strict";
import { test } from "node:test";
import { makeJobKey, normalizeDownloadUrl } from "./job-key.ts";

test("normalizeDownloadUrl strips tracking and aliases hosts", () => {
  assert.equal(
    normalizeDownloadUrl("https://youtu.be/abc123?si=zzz"),
    "https://youtube.com/watch?v=abc123",
  );
  assert.equal(
    normalizeDownloadUrl("https://www.youtube.com/watch?v=abc123&utm_source=share&feature=share"),
    "https://youtube.com/watch?v=abc123",
  );
  assert.equal(
    normalizeDownloadUrl("https://vt.tiktok.com/ZSq3FSvcg?_t=1"),
    "https://vt.tiktok.com/ZSq3FSvcg",
  );
  assert.equal(
    normalizeDownloadUrl("https://www.instagram.com/reel/xyz/?igsh=1"),
    "https://instagram.com/reel/xyz",
  );
  assert.equal(
    normalizeDownloadUrl("https://twitter.com/user/status/99?s=20"),
    "https://x.com/i/status/99",
  );
});

test("same user and same video share one job_key", () => {
  const a = makeJobKey(7, "https://youtu.be/abc123?si=1");
  const b = makeJobKey(7, "https://www.youtube.com/watch?v=abc123&utm_source=tg");
  const c = makeJobKey(8, "https://youtu.be/abc123");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("job_key is stable across repeated calls and tracking variants", () => {
  const url = "https://www.YouTube.com/watch?v=abc123&utm_source=x&si=1";
  const a = makeJobKey("42", url);
  const b = makeJobKey(42, "https://youtu.be/abc123");
  const c = makeJobKey(42, "https://youtube.com/watch?v=abc123&feature=share");
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(makeJobKey(42, url), a);
  assert.equal(a.startsWith("42:"), true);
});

test("long urls hash stably without embedding the raw url", () => {
  const long = `https://example.com/watch?v=${"x".repeat(500)}`;
  const k1 = makeJobKey(9, long);
  const k2 = makeJobKey(9, long);
  assert.equal(k1, k2);
  assert.match(k1, /^9:sha256:[a-f0-9]{64}$/);
  assert.equal(k1.includes("xxxx"), false);
});
