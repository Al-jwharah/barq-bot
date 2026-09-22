import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { formatLeaderboard, leaderboardLive, demoLeaderboardRows } from "./leaderboard.server.ts";
import { LEADERBOARD_LIVE } from "./config.server.ts";

test("leaderboard live flag defaults off", () => {
  assert.equal(LEADERBOARD_LIVE, false);
  assert.equal(leaderboardLive(), false);
});

test("formatLeaderboard gated vs live", () => {
  const gated = formatLeaderboard([{ tg_id: "12345", downloads: 9, rank: 1 }], false);
  assert.match(gated, /BARQ_LEADERBOARD_LIVE=off/);
  const live = formatLeaderboard([{ tg_id: "12345678", downloads: 9, rank: 1 }], true);
  assert.match(live, /لوحة المتصدرين/);
  assert.match(live, /…5678/);
  assert.match(live, /9/);
  assert.match(formatLeaderboard([], true), /لا تحميلات/);
});

test("demo rows available when gated", () => {
  const demo = demoLeaderboardRows();
  assert.ok(demo.length >= 3);
  assert.equal(demo[0]!.rank, 1);
});

test("API and page routes exist", () => {
  const api = readFileSync("src/routes/api/leaderboard.ts", "utf8");
  assert.match(api, /leaderboardPayload/);
  assert.match(api, /createFileRoute\("\/api\/leaderboard"\)/);
  const page = readFileSync("src/routes/leaderboard.tsx", "utf8");
  assert.match(page, /createFileRoute\("\/leaderboard"\)/);
});
