import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SMART_CLIPS_BTN,
  SMART_CLIPS_CALLBACK,
  SMART_CLIPS_MIN_SEC,
  energyWindowsFromSilenceLog,
  formatSmartClipsMessage,
  heuristicClipWindows,
  isLongEnoughForSmartClips,
  smartClipsEligible,
} from "./smart-clips.ts";

test("threshold ~90s", () => {
  assert.equal(SMART_CLIPS_MIN_SEC, 90);
  assert.equal(isLongEnoughForSmartClips(89), false);
  assert.equal(isLongEnoughForSmartClips(90), true);
  assert.equal(SMART_CLIPS_CALLBACK, "ai:clips");
  assert.equal(SMART_CLIPS_BTN, "مقاطع ذكية");
});

test("heuristic windows for 120s video", () => {
  const wins = heuristicClipWindows(120);
  assert.equal(wins.length, 3);
  for (const w of wins) {
    assert.ok(w.endSec > w.startSec);
    assert.ok(w.endSec <= 120);
    assert.ok(w.startSec >= 0);
  }
});

test("short video yields empty heuristic", () => {
  assert.deepEqual(heuristicClipWindows(40), []);
});

test("silence log → energy windows", () => {
  const log = [
    "silence_start: 0",
    "silence_end: 5",
    "silence_start: 40",
    "silence_end: 55",
  ].join("\n");
  const wins = energyWindowsFromSilenceLog(log, 100);
  assert.ok(wins.length >= 1);
  assert.ok(wins[0]!.endSec > wins[0]!.startSec);
});

test("format + eligibility", () => {
  const msg = formatSmartClipsMessage(heuristicClipWindows(100), 100);
  assert.match(msg, /مقاطع ذكية/);
  assert.equal(smartClipsEligible({ url: "https://x.com/1", duration: 100 }), true);
  assert.equal(smartClipsEligible({ url: "https://x.com/1", duration: 10 }), false);
});
