import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FILE_KEEP_DAYS,
  LOG_KEEP_DAYS,
  TEMP_KEEP_HOURS,
  fileExpiredAt,
  logExpiredAt,
  retentionRates,
  tempExpiredAt,
} from "./retention.ts";

test("D1 D7 D30 use only aged cohorts", () => {
  const today = "2026-09-19";
  const users = [
    { created: "2026-09-18", lastSeen: "2026-09-19" },
    { created: "2026-09-18", lastSeen: "2026-09-18" },
    { created: "2026-09-12", lastSeen: "2026-09-19" },
    { created: "2026-08-01", lastSeen: "2026-09-01" },
    { created: "2026-08-01", lastSeen: "2026-08-02" },
    { created: "2026-09-19", lastSeen: "2026-09-19" },
  ];
  const r = retentionRates(users, today);
  assert.equal(r.d1n, 5);
  assert.equal(r.d1, 80);
  assert.equal(r.d7n, 3);
  assert.equal(r.d7, 67);
  assert.equal(r.d30n, 2);
  assert.equal(r.d30, 50);
});

test("file retention durations match product policy", () => {
  assert.equal(FILE_KEEP_DAYS, 7);
  assert.equal(TEMP_KEEP_HOURS, 6);
  assert.equal(LOG_KEEP_DAYS, 30);
  const t0 = Date.parse("2026-09-01T00:00:00Z");
  assert.equal(fileExpiredAt(t0, t0 + 6 * 86400000), false);
  assert.equal(fileExpiredAt(t0, t0 + 7 * 86400000), true);
  assert.equal(tempExpiredAt(t0, t0 + 5 * 3600000), false);
  assert.equal(tempExpiredAt(t0, t0 + 6 * 3600000), true);
  assert.equal(logExpiredAt(t0, t0 + 29 * 86400000), false);
  assert.equal(logExpiredAt(t0, t0 + 30 * 86400000), true);
});
