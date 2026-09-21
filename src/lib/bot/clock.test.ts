import assert from "node:assert/strict";
import { test } from "node:test";
import { riyadhDay, riyadhTomorrowMs, secondsUntilRiyadhTomorrow } from "./clock.ts";
import { BARQ_TIMEZONE } from "./config.server.ts";

test("timezone default is Asia/Riyadh", () => {
  assert.equal(BARQ_TIMEZONE, "Asia/Riyadh");
});

test("riyadhDay is YYYY-MM-DD in Asia/Riyadh", () => {
  const day = riyadhDay(Date.parse("2026-09-20T21:00:00Z"));
  assert.equal(day, "2026-09-21");
  const evening = riyadhDay(Date.parse("2026-09-20T20:00:00Z"));
  assert.equal(evening, "2026-09-20");
});

test("Riyadh midnight is 21:00 UTC (no DST)", () => {
  const before = Date.parse("2026-09-20T20:59:30Z");
  assert.equal(riyadhDay(before), "2026-09-20");
  const after = Date.parse("2026-09-20T21:00:00Z");
  assert.equal(riyadhDay(after), "2026-09-21");
  const secs = secondsUntilRiyadhTomorrow(before);
  assert.ok(secs <= 60, String(secs));
  assert.ok(secs >= 1);
  assert.equal(riyadhTomorrowMs(before), after);
});

test("secondsUntilRiyadhTomorrow is positive", () => {
  assert.ok(secondsUntilRiyadhTomorrow() > 0);
});
