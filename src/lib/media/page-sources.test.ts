import assert from "node:assert/strict";
import { test } from "node:test";
import { looksBlocked, previewMirrors, providerHealthy, readerUrl, recordProvider, resetProviderHealthForTests } from "./page-sources.server";

test("reddit links map to preview mirrors, others do not", () => {
  assert.deepEqual(previewMirrors("https://www.reddit.com/r/a/comments/xyz/t/"), [
    "https://vxreddit.com/r/a/comments/xyz/t/",
    "https://rxddit.com/r/a/comments/xyz/t/",
  ]);
  assert.deepEqual(previewMirrors("https://redd.it/xyz"), ["https://vxreddit.com/comments/xyz", "https://rxddit.com/comments/xyz"]);
  assert.deepEqual(previewMirrors("https://example.com/r/a"), []);
  assert.deepEqual(previewMirrors("not a url"), []);
});

test("bot walls are detected", () => {
  assert.equal(looksBlocked(403, "x"), true);
  assert.equal(looksBlocked(200, "<html><title>Just a moment...</title>"), true);
  assert.equal(looksBlocked(200, "<html><title>News</title>"), false);
});

test("provider cools down after 3 failures and recovers", () => {
  resetProviderHealthForTests();
  const t = 1_000_000;
  recordProvider("m", false, t);
  recordProvider("m", false, t);
  assert.equal(providerHealthy("m", t), true);
  recordProvider("m", false, t);
  assert.equal(providerHealthy("m", t + 1000), false);
  assert.equal(providerHealthy("m", t + 11 * 60 * 1000), true);
  recordProvider("m", true, t);
  assert.equal(providerHealthy("m", t), true);
});

test("reader url wraps target", () => {
  assert.equal(readerUrl("https://a.b/c"), "https://r.jina.ai/https://a.b/c");
});
