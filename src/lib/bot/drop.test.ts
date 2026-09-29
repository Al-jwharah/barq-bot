import assert from "node:assert/strict";
import { test } from "node:test";
import { clearDrop, dropTtlMs, parseDropHours, peekDrop, stashDrop, takeDrop } from "./drop.server.ts";

test("drop hours are only 12 or 24", () => {
  assert.equal(parseDropHours("12"), 12);
  assert.equal(parseDropHours("24 ساعة"), 24);
  assert.equal(parseDropHours("48"), null);
  assert.equal(parseDropHours("رابط"), null);
  assert.equal(dropTtlMs(12), 12 * 60 * 60 * 1000);
  assert.equal(dropTtlMs(24), 24 * 60 * 60 * 1000);
});

test("stashed drop file is isolated per user and consumed once", () => {
  clearDrop(7);
  clearDrop(8);
  stashDrop(7, { fileId: "a", kind: "photo" });
  stashDrop(8, { fileId: "b", kind: "file" });
  assert.equal(peekDrop(7)?.fileId, "a");
  assert.equal(takeDrop(7)?.kind, "photo");
  assert.equal(takeDrop(7), null);
  assert.equal(peekDrop(8)?.fileId, "b");
  clearDrop(8);
});
