import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BURST_PER_MINUTE,
  BURST_TIMEOUT_SEC,
  QUEUE_MAX_PENDING,
  burstMessage,
  duplicateMessage,
  hugeFileMessage,
  queueFullMessage,
  urlFingerprint,
} from "./abuse.server.ts";

test("abuse constants match the product rules", () => {
  assert.equal(BURST_PER_MINUTE, 50);
  assert.equal(BURST_TIMEOUT_SEC, 600);
  assert.equal(QUEUE_MAX_PENDING, 80);
  assert.match(burstMessage(600), /10/);
  assert.match(duplicateMessage(), /الرابط/);
  assert.match(queueFullMessage(), /الطابور/);
  assert.match(hugeFileMessage(), /MB/);
});

test("url fingerprint is stable and short", () => {
  const a = urlFingerprint("https://vt.tiktok.com/x");
  const b = urlFingerprint("https://vt.tiktok.com/x");
  const c = urlFingerprint("https://vt.tiktok.com/y");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 24);
});
