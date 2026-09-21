import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertTransition,
  canActorCancel,
  canTransition,
  errorCodeOf,
  errorMessageSafe,
  jobTimeoutMs,
} from "./job-status.ts";

test("allows only the documented job transitions", () => {
  assert.equal(canTransition("pending", "processing"), true);
  assert.equal(canTransition("pending", "cancelled"), true);
  assert.equal(canTransition("processing", "uploading"), true);
  assert.equal(canTransition("processing", "failed"), true);
  assert.equal(canTransition("processing", "cancelled"), true);
  assert.equal(canTransition("uploading", "completed"), true);
  assert.equal(canTransition("uploading", "failed"), true);
  assert.equal(canTransition("uploading", "cancelled"), true);
  assert.equal(canTransition("completed", "expired"), true);
  assert.equal(canTransition("failed", "pending"), true);
});

test("rejects illegal transitions", () => {
  assert.equal(canTransition("completed", "processing"), false);
  assert.equal(canTransition("expired", "completed"), false);
  assert.equal(canTransition("cancelled", "uploading"), false);
  assert.equal(canTransition("cancelled", "processing"), false);
  assert.equal(canTransition("cancelled", "pending"), false);
  assert.equal(canTransition("expired", "pending"), false);
  assert.equal(canTransition("pending", "completed"), false);
  assert.equal(canTransition("processing", "pending"), false);
  assert.equal(canTransition("uploading", "pending"), false);
  assert.equal(canTransition("completed", "failed"), false);
  assert.throws(() => assertTransition("completed", "processing"));
  assert.throws(() => assertTransition("expired", "completed"));
  assert.throws(() => assertTransition("cancelled", "uploading"));
});

test("uploading can move to cancelled", () => {
  assert.equal(canTransition("uploading", "cancelled"), true);
  assert.doesNotThrow(() => assertTransition("uploading", "cancelled"));
});

test("errorMessageSafe strips secrets and urls", () => {
  const out = errorMessageSafe("fail https://x.com/a 1111111111:AAsecretkeyvaluehere xai-abcdef123456");
  assert.equal(out.includes("https://"), false);
  assert.equal(out.includes("AAsecret"), false);
  assert.equal(out.includes("xai-"), false);
  assert.equal(errorCodeOf("403 forbidden"), "forbidden");
  assert.equal(errorCodeOf("nsfw blocked"), "blocked");
  assert.equal(errorCodeOf("DOWNLOAD_TIMEOUT"), "timeout");
  assert.equal(errorCodeOf("this link has expired"), "expired_link");
  assert.equal(errorCodeOf("provider temp"), "provider_temp");
});

test("DOWNLOAD_TIMEOUT_MS defaults to 900000", () => {
  const prev = process.env.DOWNLOAD_TIMEOUT_MS;
  delete process.env.DOWNLOAD_TIMEOUT_MS;
  assert.equal(jobTimeoutMs(), 900000);
  process.env.DOWNLOAD_TIMEOUT_MS = "120000";
  assert.equal(jobTimeoutMs(), 120000);
  process.env.DOWNLOAD_TIMEOUT_MS = "0";
  assert.equal(jobTimeoutMs(), 900000);
  if (prev == null) delete process.env.DOWNLOAD_TIMEOUT_MS;
  else process.env.DOWNLOAD_TIMEOUT_MS = prev;
});

test("cancel is owner-only and only from active states", () => {
  assert.equal(canActorCancel("111", 111, false, "processing"), true);
  assert.equal(canActorCancel("111", 111, false, "uploading"), true);
  assert.equal(canActorCancel("111", 111, false, "pending"), true);
  assert.equal(canActorCancel("111", 222, false, "processing"), false);
  assert.equal(canActorCancel("111", 222, true, "processing"), true);
  assert.equal(canActorCancel("111", 111, false, "completed"), false);
  assert.equal(canActorCancel("111", 111, false, "failed"), false);
  assert.equal(canActorCancel("111", 111, true, "expired"), false);
  assert.equal(canActorCancel("111", 111, true, "cancelled"), false);
});
