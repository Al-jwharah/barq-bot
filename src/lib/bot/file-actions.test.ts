import assert from "node:assert/strict";
import { test } from "node:test";
import { clipActionRows } from "./brand.ts";
import { parseClipRange, publishDraft } from "./file-actions.server.ts";

test("clip range accepts mm:ss and rejects junk", () => {
  assert.deepEqual(parseClipRange("00:12-00:35"), { start: 12, end: 35 });
  assert.deepEqual(parseClipRange("1:02-1:40"), { start: 62, end: 100 });
  assert.equal(parseClipRange("00:40-00:10"), null);
  assert.equal(parseClipRange("00:00-05:00"), null);
  assert.equal(parseClipRange("hello"), null);
});

test("publish draft does not invent scenes", () => {
  const text = publishDraft({ url: "https://example.com/v", title: "عنوان فقط" });
  assert.match(text, /مسودة/);
  assert.match(text, /عنوان فقط/);
  assert.match(text, /https:\/\/example.com\/v/);
  assert.doesNotMatch(text, /هاشتاق|مشهد/);
});

test("file buttons are the actions for that file", () => {
  const video = clipActionRows(undefined, "https://example.com/v", "video").flat().map((b) => b.text);
  const audio = clipActionRows(undefined, "https://example.com/a", "audio").flat().map((b) => b.text);
  assert.deepEqual(video, ["✂️ قصّ", "📣 جهّز", "🔖 احفظ", "↗️ مشاركة"]);
  assert.equal(audio.includes("✂️ قصّ"), false);
  assert.equal(video.some((t) => /موقع|قهوة|قيّم/.test(t)), false);
});
