import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isCopyrightError,
  isGoneError,
  looksLikeLiveStream,
  previewCaption,
  progressStatus,
  queueEta,
  referralCode,
  shareTargets,
  shareUrl,
  stageProgress,
} from "./product.server.ts";
import { userFailMessage } from "../jobs/retry-policy.ts";
import { PRO_PLAN, SEASON_PLAN, starsForSar } from "./plans.ts";

test("progress stages increase", () => {
  assert.equal(stageProgress("safe").pct, 15);
  assert.equal(stageProgress("done").pct, 100);
  assert.match(progressStatus("extract"), /%/);
});

test("live streams and gone/copyright copy", () => {
  assert.equal(looksLikeLiveStream("https://www.twitch.tv/somechannel"), true);
  assert.equal(looksLikeLiveStream("https://clips.twitch.tv/NiceClip"), false);
  assert.equal(looksLikeLiveStream("https://www.youtube.com/watch?v=abc"), false);
  assert.equal(isGoneError("This video has been removed"), true);
  assert.equal(isCopyrightError("claimed by copyright"), true);
  assert.match(userFailMessage("this video has been removed"), /محذوف/);
  assert.match(userFailMessage("this is a live stream"), /بث/);
});

test("share url and referral code", () => {
  assert.match(shareUrl("https://youtu.be/a", "hi"), /t\.me\/share/);
  const s = shareTargets("https://youtu.be/a", "hi");
  assert.match(s.whatsapp, /whatsapp/);
  assert.match(s.snapchat, /snapchat/);
  assert.match(s.x, /twitter|x\.com|intent/);
  assert.match(s.facebook, /facebook/);
  assert.match(referralCode(8471762251), /^b/);
  assert.match(queueEta(2), /ثانية|دقيقة/);
});

test("preview caption includes duration or size placeholder", () => {
  const text = previewCaption({
    platform: "youtube",
    sourceUrl: "https://youtu.be/a",
    title: "تجربة",
    items: [{ kind: "video", url: "https://cdn.example/a.mp4", duration: 12, variants: [{ url: "https://cdn.example/a.mp4", quality: "720p", size: 8_000_000, contentType: "video/mp4" }] }],
  });
  assert.match(text, /أعلى جودة/);
  assert.match(text, /12ث/);
  assert.doesNotMatch(text, /تجربة/);
});

test("pro is 9.99 / 100 stars and season saves 20%", () => {
  assert.equal(starsForSar(9.99), 100);
  assert.equal(PRO_PLAN.stars, 100);
  assert.equal(PRO_PLAN.dailyCap, 50);
  assert.equal(SEASON_PLAN.days, 90);
  assert.ok(Number(SEASON_PLAN.sar) < 4.99 * 3);
});
