import assert from "node:assert/strict";
import { test } from "node:test";
import { riyadhDay } from "./clock.ts";
import { tiktokVideoId } from "../media/platforms/tiktok.ts";
import {
  DAILY_AI_CAP,
  DAILY_DOWNLOAD_CAP,
  refundUsage,
  takeDailyAi,
  takeDailyDownload,
  takeUsage,
  usageCount,
} from "./usage.server.ts";

test("daily usage key is Riyadh calendar date not UTC", () => {
  assert.equal(riyadhDay(Date.parse("2026-09-20T21:30:00Z")), "2026-09-21");
  assert.equal(riyadhDay(Date.parse("2026-09-20T20:00:00Z")), "2026-09-20");
});

test("tiktok short links have no video id until expanded", () => {
  assert.equal(tiktokVideoId("https://vt.tiktok.com/ZSq3FSvcg"), null);
  assert.equal(tiktokVideoId("https://tiktok.com/@u/video/7687615730665164040"), "7687615730665164040");
});

test("free daily caps are 5 downloads and 10 AI", () => {
  assert.equal(DAILY_DOWNLOAD_CAP, 5);
  assert.equal(DAILY_AI_CAP, 10);
});

test("5 downloads per Riyadh day then blocks with retryAfter", async () => {
  const id = `dl-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now = Date.parse("2026-09-20T22:00:00Z");
  for (let i = 0; i < 5; i += 1) {
    const r = await takeDailyDownload(id, undefined, now);
    assert.equal(r.ok, true, `take ${i + 1}`);
    assert.equal(r.count, i + 1);
  }
  const blocked = await takeDailyDownload(id, undefined, now);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfter >= 1);
  assert.equal(await usageCount(id, "download", undefined, now), 5);
});

test("10 AI turns per Riyadh day then blocks", async () => {
  const id = `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now = Date.parse("2026-09-21T08:00:00Z");
  for (let i = 0; i < 10; i += 1) {
    const r = await takeDailyAi(id, undefined, now);
    assert.equal(r.ok, true, `ai ${i + 1}`);
  }
  const blocked = await takeDailyAi(id, undefined, now);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfter >= 1);
});

test("refund restores one daily slot", async () => {
  const id = `rf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now = Date.parse("2026-09-21T10:00:00Z");
  for (let i = 0; i < 5; i += 1) {
    await takeUsage(id, "download", 5, undefined, now);
  }
  assert.equal((await takeUsage(id, "download", 5, undefined, now)).ok, false);
  const left = await refundUsage(id, "download", undefined, now);
  assert.equal(left, 4);
  const again = await takeUsage(id, "download", 5, undefined, now);
  assert.equal(again.ok, true);
});

test("new Riyadh day starts a fresh counter", async () => {
  const id = `day-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const monday = Date.parse("2026-09-20T20:00:00Z");
  const tuesday = Date.parse("2026-09-20T21:05:00Z");
  assert.equal(riyadhDay(monday), "2026-09-20");
  assert.equal(riyadhDay(tuesday), "2026-09-21");
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await takeDailyDownload(id, undefined, monday)).ok, true);
  }
  assert.equal((await takeDailyDownload(id, undefined, monday)).ok, false);
  const next = await takeDailyDownload(id, undefined, tuesday);
  assert.equal(next.ok, true);
  assert.equal(next.count, 1);
});
