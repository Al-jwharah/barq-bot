import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUBTITLES_BTN,
  SUBTITLES_CALLBACK,
  SUBTITLES_TOGGLE_CALLBACK,
  cuesToSrt,
  formatSrtTime,
  isSubtitlesOptedIn,
  runSubtitlesPipeline,
  scaffoldCuesFromText,
  setSubtitlesOptIn,
  subtitlesBurnEnabled,
  subtitlesEnvProposalLines,
  subtitlesFeatureEnabled,
  toggleSubtitlesOptIn,
} from "./subtitles.ts";

test("constants and ENV proposal", () => {
  assert.equal(SUBTITLES_BTN, "ترجمة اختيارية");
  assert.equal(SUBTITLES_CALLBACK, "ai:subs");
  assert.equal(SUBTITLES_TOGGLE_CALLBACK, "ai:subs:toggle");
  assert.match(subtitlesEnvProposalLines().join("\n"), /BARQ_AI_SUBTITLES/);
});

test("opt-in toggle is per-user", () => {
  setSubtitlesOptIn(42, false);
  assert.equal(isSubtitlesOptedIn(42), false);
  assert.equal(toggleSubtitlesOptIn(42), true);
  assert.equal(isSubtitlesOptedIn(42), true);
  assert.equal(toggleSubtitlesOptIn(42), false);
});

test("SRT scaffold + timing", () => {
  assert.equal(formatSrtTime(65.5), "00:01:05,500");
  const cues = scaffoldCuesFromText("مرحبا بالعالم هذا اختبار ترجمة طويل قليلا", 20);
  assert.ok(cues.length >= 1);
  const srt = cuesToSrt(cues);
  assert.match(srt, /-->/);
  assert.match(srt, /مرحبا/);
});

test("pipeline respects feature flag and opt-in", async () => {
  delete process.env.BARQ_AI_SUBTITLES_BURN;
  assert.equal(subtitlesBurnEnabled(), false);
  process.env.BARQ_AI_SUBTITLES = "on";
  assert.equal(subtitlesFeatureEnabled(), true);
  setSubtitlesOptIn(7, false);
  const off = await runSubtitlesPipeline(7);
  assert.equal(off.optedIn, false);
  setSubtitlesOptIn(7, true);
  const on = await runSubtitlesPipeline(7);
  assert.equal(on.optedIn, true);
  assert.ok(on.status === "no_clip" || on.status === "ready_scaffold");
});
