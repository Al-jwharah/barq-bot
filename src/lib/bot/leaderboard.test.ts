import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { formatLeaderboard, leaderboardLive, demoLeaderboardRows } from "./leaderboard.server.ts";

test("leaderboard gated by default", () => {
  assert.equal(leaderboardLive(), false);
  const gated = formatLeaderboard([], false);
  assert.match(gated, /BARQ_LEADERBOARD_LIVE=off/);
});

test("demo rows available when gated", () => {
  const demo = demoLeaderboardRows();
  assert.ok(demo.length >= 3);
  assert.equal(demo[0]!.rank, 1);
});

test("API and page routes exist", () => {
  const api = readFileSync("src/routes/api/leaderboard.ts", "utf8");
  assert.match(api, /leaderboardPayload|leaderboardLive|LEADERBOARD_LIVE/);
  assert.match(api, /createFileRoute\("\/api\/leaderboard"\)/);
  const page = readFileSync("src/routes/leaderboard.tsx", "utf8");
  assert.match(page, /createFileRoute\("\/leaderboard"\)/);
});
