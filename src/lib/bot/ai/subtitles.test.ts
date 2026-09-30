import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUBTITLES_BTN,
  SUBTITLES_CALLBACK,
  SUBTITLES_TOGGLE_CALLBACK,
  buildTranslateUser,
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
import { AI_MISSING_KEY_AR } from "./copy.ts";
import { setLastClip } from "../session.server.ts";

test("constants and ENV proposal", () => {
  assert.equal(SUBTITLES_BTN, "ترجمة");
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

test("translate user payload uses description", () => {
  const u = buildTranslateUser({
    url: "https://x.com/1",
    title: "Hello",
    description: "World news clip",
  });
  assert.match(u, /Hello/);
  assert.match(u, /World news/);
});

test("pipeline respects feature flag; missing key fails loudly when opted in", async () => {
  delete process.env.BARQ_AI_SUBTITLES_BURN;
  const prevKey = process.env.XAI_API_KEY;
  delete process.env.XAI_API_KEY;
  assert.equal(subtitlesBurnEnabled(), false);
  process.env.BARQ_AI_SUBTITLES = "on";
  assert.equal(subtitlesFeatureEnabled(), true);
  setSubtitlesOptIn(7, false);
  const off = await runSubtitlesPipeline(7);
  assert.equal(off.optedIn, false);
  setSubtitlesOptIn(7, true);
  setLastClip(7, { url: "https://x.com/1", title: "t", description: "d" });
  const on = await runSubtitlesPipeline(7);
  assert.equal(on.optedIn, true);
  assert.equal(on.status, "no_key");
  assert.match(on.message, /مفتاح الخدمة غير مضبوط/);
  assert.equal(on.message, AI_MISSING_KEY_AR);
  if (prevKey != null) process.env.XAI_API_KEY = prevKey;
  else delete process.env.XAI_API_KEY;
});
