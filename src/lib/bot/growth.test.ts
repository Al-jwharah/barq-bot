import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { likeButtonLabel, likesPanelText, nextStreak, pendingAchievements, todayStamp } from "./growth.server.ts";

test("streak continues, resets, and stays same day", () => {
  assert.equal(nextStreak(0, null, "2026-09-19").kind, "first");
  assert.equal(nextStreak(2, "2026-09-18", "2026-09-19").streak, 3);
  assert.equal(nextStreak(2, "2026-09-18", "2026-09-19").kind, "continue");
  assert.equal(nextStreak(5, "2026-09-19", "2026-09-19").kind, "same");
  assert.equal(nextStreak(5, "2026-09-10", "2026-09-19").streak, 1);
  assert.equal(nextStreak(5, "2026-09-10", "2026-09-19").kind, "reset");
});

test("achievements unlock from stats", () => {
  const codes = pendingAchievements({
    onboarding_step: -1,
    downloads_ok: 5,
    ai_uses: 1,
    tips: 0,
    streak: 3,
    journeys: ["start"],
  });
  assert.ok(codes.includes("onboarded"));
  assert.ok(codes.includes("first_dl"));
  assert.ok(codes.includes("dl_5"));
  assert.ok(!codes.includes("dl_25"));
  assert.ok(codes.includes("streak_3"));
  assert.ok(codes.includes("first_ai"));
  assert.ok(codes.includes("journey_start"));
});

test("todayStamp is ISO date", () => {
  assert.match(todayStamp(new Date("2026-09-19T12:00:00Z")), /^\d{4}-\d{2}-\d{2}$/);
});

test("like button shows stored count immediately", () => {
  assert.equal(likeButtonLabel(0), "⚡️ أعجبني · 0");
  assert.equal(likeButtonLabel(12), "⚡️ أعجبني · 12");
  const panel = likesPanelText(12, [{ tg_id: "8471762251", created_at: "2026-09-21T00:00:00.000Z" }]);
  assert.match(panel, /العدد المخزّن: 12/);
  assert.match(panel, /8471762251/);
});

test("likes persist in bot_likes and like_counter", () => {
  const src = readFileSync("src/lib/bot/growth.server.ts", "utf8");
  assert.match(src, /create table if not exists bot_likes/);
  assert.match(src, /create table if not exists like_counter/);
  assert.match(src, /update like_counter set total = total \+ 1/);
  assert.match(src, /on conflict \(tg_id\) do nothing/);
  const mig = readFileSync("migrations/0022_likes.sql", "utf8");
  assert.match(mig, /like_counter/);
  assert.match(mig, /bot_likes/);
});
