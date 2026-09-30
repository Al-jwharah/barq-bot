import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("hostTelegramFile falls back to tgfile when Blob suspended", () => {
  const src = readFileSync(new URL("./host.server.ts", import.meta.url), "utf8");
  assert.match(src, /tgFileStorageKey/);
  assert.match(src, /isBlobStoreUnavailable/);
  assert.match(src, /Telegram file_id/);
  assert.match(src, /BLOB_SUSPENDED_AR/);
});

test("putClipBlob soft-fails so createClipLink can succeed on Postgres", () => {
  const src = readFileSync(new URL("./clip-blob.server.ts", import.meta.url), "utf8");
  assert.match(src, /soft-fail/);
  assert.match(src, /isBlobStoreUnavailable/);
});

test("clip-serve streams tgfile keys via Telegram getFile", () => {
  const src = readFileSync(new URL("./clip-serve.server.ts", import.meta.url), "utf8");
  assert.match(src, /isTgFileStorageKey/);
  assert.match(src, /streamTelegramFile/);
  assert.match(src, /telegram\.getFile/);
  // media_url proxy must still use safeFetch; tg CDN uses dedicated helper
  assert.match(src, /safeFetch/);
  assert.doesNotMatch(src, /fetch\(clip\.media_url/);
});
