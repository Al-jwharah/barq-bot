import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import {
  batchProgressCard,
  dailyLimitWarningText,
  isJourneyCommand,
  isLibraryCommand,
  isLeaderboardCommand,
  journeyStreakLine,
  multiLinkProgressText,
  referralsGatedMessage,
  shouldWarnDailyLimit,
} from "./engagement.ts";
import { REFERRALS_LIVE, LEADERBOARD_LIVE, SUBSCRIPTIONS_LIVE } from "./config.server.ts";

afterEach(() => {
  /* flags are evaluated at import — assert defaults only */
});

test("B1 batch progress card 🟢🟢🟡⚪⚪", () => {
  assert.equal(batchProgressCard(0, 0, 5), "🟡⚪⚪⚪⚪");
  assert.equal(batchProgressCard(2, 2, 5), "🟢🟢🟡⚪⚪");
  assert.equal(batchProgressCard(5, 4, 5), "🟢🟢🟢🟢🟢");
  assert.match(multiLinkProgressText({ total: 3, active: 1, done: 1 }), /🟢🟡⚪/);
  assert.match(multiLinkProgressText({ total: 5, active: 0, done: 0, cap: 3 }), /أول 3/);
});

test("B5 daily limit warn at #4 of 5", () => {
  assert.equal(shouldWarnDailyLimit(4, 5), true);
  assert.equal(shouldWarnDailyLimit(3, 5), false);
  assert.equal(shouldWarnDailyLimit(5, 5), false);
  assert.equal(shouldWarnDailyLimit(0, 5), false);
  assert.match(dailyLimitWarningText(4, 5), /4 من 5/);
  assert.match(dailyLimitWarningText(4, 5), /يتبقى 1/);
});

test("B6 journey streak line", () => {
  assert.match(journeyStreakLine(0, 0), /يومك الأول/);
  assert.match(journeyStreakLine(3, 7), /3 يوم متتالي/);
  assert.match(journeyStreakLine(3, 7), /أفضل 7/);
});

test("B2 library and journey aliases", () => {
  assert.equal(isLibraryCommand("سجلي"), true);
  assert.equal(isLibraryCommand("مكتبتي"), true);
  assert.equal(isLibraryCommand("/library"), true);
  assert.equal(isLibraryCommand("مرحبا"), false);
  assert.equal(isJourneyCommand("رحلتي"), true);
  assert.equal(isJourneyCommand("رحلتك"), true);
  assert.equal(isLeaderboardCommand("/leaderboard"), true);
});

test("B3/B4 flags default OFF; subscriptions stay OFF", () => {
  assert.equal(REFERRALS_LIVE, false);
  assert.equal(LEADERBOARD_LIVE, false);
  assert.equal(SUBSCRIPTIONS_LIVE, false);
  assert.match(referralsGatedMessage(), /BARQ_REFERRALS_LIVE=off/);
  assert.match(referralsGatedMessage(), /48 ساعة/);
});

test("config lists new engagement flags as known booleans", () => {
  const src = readFileSync("src/lib/bot/config.server.ts", "utf8");
  assert.match(src, /BARQ_REFERRALS_LIVE/);
  assert.match(src, /BARQ_LEADERBOARD_LIVE/);
  assert.match(src, /REFERRALS_LIVE = envFlag\("BARQ_REFERRALS_LIVE", false\)/);
  assert.match(src, /LEADERBOARD_LIVE = envFlag\("BARQ_LEADERBOARD_LIVE", false\)/);
});

test("handle wires engagement gates and batch card", () => {
  const handle = readFileSync("src/lib/bot/handle.server.ts", "utf8");
  assert.match(handle, /multiLinkProgressText/);
  assert.match(handle, /REFERRALS_LIVE|referralsGatedMessage/);
  assert.match(handle, /isLibraryCommand/);
  const growth = readFileSync("src/lib/bot/growth.server.ts", "utf8");
  assert.match(growth, /warnDailyLimitIfNeeded/);
  assert.match(growth, /journeyStreakLine/);
  const product = readFileSync("src/lib/bot/product.server.ts", "utf8");
  assert.match(product, /REFERRALS_LIVE/);
});
