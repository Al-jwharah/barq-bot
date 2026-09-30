import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPTION_TONE_LABEL,
  CAPTION_TONES,
  buildCaptionSystem,
  buildCaptionUser,
  captionCallback,
  captionToneButtons,
  extractCopyBlock,
  isCaptionTone,
  parseCaptionCallback,
} from "./captions.ts";

test("tones فصحى/خليجي/مصري are registered", () => {
  assert.deepEqual([...CAPTION_TONES], ["fusha", "khaleeji", "masri"]);
  assert.equal(CAPTION_TONE_LABEL.fusha, "فصحى");
  assert.equal(CAPTION_TONE_LABEL.khaleeji, "خليجي");
  assert.equal(CAPTION_TONE_LABEL.masri, "مصري");
  assert.equal(isCaptionTone("masri"), true);
  assert.equal(isCaptionTone("fr"), false);
});

test("callback parse round-trip", () => {
  assert.equal(parseCaptionCallback(captionCallback("khaleeji")), "khaleeji");
  assert.equal(parseCaptionCallback("ai:cap:nope"), null);
});

test("extractCopyBlock prefers COPY fence", () => {
  const { copyText, caption } = extractCopyBlock("intro\n<<<COPY\nهلا والله #برق\nCOPY>>>");
  assert.match(copyText, /هلا والله/);
  assert.match(caption, /هلا/);
});

test("caption buttons expose three tones", () => {
  const rows = captionToneButtons();
  assert.equal(rows[0]?.length, 3);
  assert.equal(rows[0]?.[0]?.callback_data, "ai:cap:fusha");
});

test("system/user builders mention tone and clip", () => {
  assert.match(buildCaptionSystem("masri"), /مصري|مصر/);
  const user = buildCaptionUser(
    { url: "https://tiktok.com/x", title: "رقص", description: "حفلة على السطح" },
    "fusha",
  );
  assert.match(user, /رقص/);
  assert.match(user, /حفلة/);
  assert.match(user, /فصحى/);
});
