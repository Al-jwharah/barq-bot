import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { urlsFromMessage } from "../bot/telegram.server.ts";
import { extractYouTube } from "./platforms/youtube.ts";

test("one message with two links is two downloads, capped later at five", () => {
  const text = "https://vt.tiktok.com/AAAA111\nhttps://www.youtube.com/watch?v=jNQXAC9IVRw";
  const urls = urlsFromMessage({ text } as never);
  assert.equal(urls.length, 2);
  assert.match(urls[0]!, /tiktok\.com/);
  assert.match(urls[1]!, /youtube\.com/);
});

test("YouTube rejects a non-youtube link before any download", async () => {
  await assert.rejects(() => extractYouTube("https://example.com/not-a-video"), /يوتيوب/);
});

test("fallback sources are wired in the extractor and the worker", () => {
  const youtube = readFileSync(new URL("./platforms/youtube.ts", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../jobs/worker.server.ts", import.meta.url), "utf8");
  assert.match(youtube, /extractInvidious/);
  assert.match(youtube, /extractWithYtdlp/);
  assert.match(worker, /hdplay/);
  assert.match(worker, /\/play\//);
  assert.doesNotMatch(worker, /tikcdn\.io\/ssstik/);
});
