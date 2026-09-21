import assert from "node:assert/strict";
import { test } from "node:test";
import { emit, on, type BarqEvent } from "./bus.ts";

test("on + emit calls handler", () => {
  const seen: Record<string, unknown>[] = [];
  on("user.created", (payload) => {
    seen.push(payload);
  });
  const payload = { userId: 42 };
  emit("user.created", payload);
  assert.equal(seen.length, 1);
  assert.equal(seen[0], payload);
});

test("unknown event does not throw", () => {
  assert.doesNotThrow(() => {
    emit("does.not.exist" as BarqEvent, { n: 1 });
  });
});
