import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { kickOrWakeExternal } from "./wake.ts";

afterEach(() => {
  delete process.env.BARQ_EXTERNAL_WORKER;
  delete process.env.WORKER_WAKE_URL;
  delete process.env.BARQ_JOB_SECRET;
});

test("kickOrWakeExternal returns off when flag disabled", async () => {
  assert.equal(await kickOrWakeExternal(), "off");
});

test("kickOrWakeExternal returns poll when on but no wake URL", async () => {
  process.env.BARQ_EXTERNAL_WORKER = "on";
  assert.equal(await kickOrWakeExternal(), "poll");
});

test("kickOrWakeExternal POSTs wake URL with secret", async () => {
  process.env.BARQ_EXTERNAL_WORKER = "on";
  process.env.WORKER_WAKE_URL = "http://127.0.0.1:9/wake"; // connection refused → poll
  process.env.BARQ_JOB_SECRET = "test-secret";
  // Refused connection → false wake → poll fallback
  assert.equal(await kickOrWakeExternal("abc"), "poll");
});
