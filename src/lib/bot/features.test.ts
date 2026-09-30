import assert from "node:assert/strict";
import { test } from "node:test";
import { FEATURE_ORDER, isFeatureName, normalizeTrimText, resolveFeature } from "./features";
import { parseClipRange } from "./file-actions.server";

test("defaults keep current UX; owner report defaults on", () => {
  const env = {};
  assert.equal(resolveFeature("quality", {}, env), false);
  assert.equal(resolveFeature("audio", {}, env), false);
  assert.equal(resolveFeature("trim", {}, env), false);
  assert.equal(resolveFeature("post_ai", {}, env), false);
  assert.equal(resolveFeature("inline", {}, env), false);
  assert.equal(resolveFeature("batch", {}, env), true);
  assert.equal(resolveFeature("owner_report", {}, env), true);
});

test("env flags seed defaults; panel setting wins", () => {
  assert.equal(resolveFeature("quality", {}, { BARQ_QUALITY_PICKER: "on" }), true);
  assert.equal(resolveFeature("quality", { ff_quality: "off" }, { BARQ_QUALITY_PICKER: "on" }), false);
  assert.equal(resolveFeature("owner_report", { ff_owner_report: "off" }, {}), false);
  assert.equal(resolveFeature("trim", { ff_trim: "on" }, {}), true);
});

test("feature names", () => {
  assert.ok(FEATURE_ORDER.every(isFeatureName));
  assert.equal(isFeatureName("nope"), false);
});

test("Arabic trim phrases normalize to a clip range", () => {
  assert.equal(normalizeTrimText("من 1:20 إلى 2:05"), "1:20-2:05");
  assert.equal(normalizeTrimText("من ١:٢٠ الى ٢:٠٥"), "1:20-2:05");
  assert.equal(normalizeTrimText("قص من 0:05 لين 0:30"), "0:05-0:30");
  assert.equal(normalizeTrimText("00:12-00:35"), "00:12-00:35");
  assert.equal(normalizeTrimText("كم الساعة 1:20"), null);
  assert.equal(normalizeTrimText("hello"), null);
  assert.deepEqual(parseClipRange(normalizeTrimText("من 1:20 إلى 2:05")!), { start: 80, end: 125 });
});

test("owner report gate: flag, owner id, once per ~day", async () => {
  const { reportDue, reportText } = await import("./owner-report.server");
  const now = 1_800_000_000_000;
  assert.equal(reportDue(false, 0, now, "8471762251"), false);
  assert.equal(reportDue(true, 0, now, ""), false);
  assert.equal(reportDue(true, 0, now, "8471762251"), true);
  assert.equal(reportDue(true, now - 3600_000, now, "8471762251"), false);
  assert.equal(reportDue(true, now - 21 * 3600_000, now, "8471762251"), true);
  const text = reportText({ members: 10, newMembers: 2, activeUsers: 3, downloads: 9, failed: 1, blocked: 0, topPlatforms: [{ platform: "tiktok", c: 5 }] }, "2026-09-30");
  assert.match(text, /90%/);
  assert.match(text, /tiktok 5/);
});

test("inline results: cached video first, open card always", async () => {
  const { inlineResults, inlineUrl } = await import("./inline.server");
  assert.equal(inlineUrl("@barq https://x.com/a/status/1)."), "https://x.com/a/status/1");
  assert.equal(inlineUrl("hello"), null);
  const r = inlineResults("https://x.com/a", { fileId: "F", kind: "video" }, "barq_ibot");
  assert.equal(r[0]?.type, "video");
  assert.equal(r[r.length - 1]?.type, "article");
  assert.equal(inlineResults(null, null, "b").length, 1);
});
