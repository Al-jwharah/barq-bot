import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isBlobStoreUnavailable,
  isTgFileStorageKey,
  tgFileIdFromStorageKey,
  tgFileStorageKey,
  TGFILE_PREFIX,
} from "./blob-status.server.ts";

test("detects BlobStoreSuspendedError by name and message", () => {
  const err = Object.assign(new Error("This store has been suspended."), {
    name: "BlobStoreSuspendedError",
  });
  assert.equal(isBlobStoreUnavailable(err), true);
  assert.equal(isBlobStoreUnavailable(new Error("Vercel Blob: Access denied")), true);
  assert.equal(isBlobStoreUnavailable(new Error("random network")), false);
});

test("tgfile storage key round-trip", () => {
  const key = tgFileStorageKey("AgACAgQAAxkBAA");
  assert.equal(key.startsWith(TGFILE_PREFIX), true);
  assert.equal(isTgFileStorageKey(key), true);
  assert.equal(tgFileIdFromStorageKey(key), "AgACAgQAAxkBAA");
  assert.equal(tgFileIdFromStorageKey("host/x"), null);
  assert.equal(tgFileIdFromStorageKey("tgfile/a/b"), null);
});
