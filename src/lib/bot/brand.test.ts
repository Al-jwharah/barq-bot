import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { botDeepLink, channelUrl, clipCaption, CLIP_LINES, normalizeChannel, TRY_BOT_LABEL } from "./brand";

describe("clipCaption", () => {
  it("uses a short signature and the site, never the source url", () => {
    const a = clipCaption("barq_ibot", "video", "tiktok", "https://vt.tiktok.com/x", 0);
    const b = clipCaption("barq_ibot", "video", "tiktok", "https://vt.tiktok.com/x", 1);
    assert.match(a, /@barq_ibot/);
    assert.match(a, /abdulrhman\.ai/);
    assert.equal(a, b);
    assert.equal(CLIP_LINES.length, 1);
    assert.equal(CLIP_LINES.some((s) => /كنتاكي|😂/.test(s)), false);
    for (let i = 0; i < CLIP_LINES.length; i += 1) {
      const cap = clipCaption("barq_ibot", "video", "tiktok", "https://vt.tiktok.com/x", i);
      assert.doesNotMatch(cap, /vt\.tiktok/);
      assert.doesNotMatch(cap, /😂|كنتاكي/);
    }
  });
});

describe("normalizeChannel", () => {
  it("accepts @user, t.me links, and strips junk", () => {
    assert.equal(normalizeChannel("@BarqChannel"), "BarqChannel");
    assert.equal(normalizeChannel("https://t.me/BarqChannel"), "BarqChannel");
    assert.equal(normalizeChannel("*****"), "");
    assert.equal(normalizeChannel(""), "");
    assert.equal(normalizeChannel("bad name"), "");
  });

  it("builds a t.me url", () => {
    assert.equal(channelUrl("BarqChannel"), "https://t.me/BarqChannel");
  });
});

describe("try bot button", () => {
  it("opens a start deep link to the bot", () => {
    assert.equal(TRY_BOT_LABEL, "جرب البوت الآن ⚡️");
    assert.equal(botDeepLink("barq_ibot"), "https://t.me/barq_ibot?start=try");
    assert.equal(botDeepLink("@barq_ibot", "try"), "https://t.me/barq_ibot?start=try");
  });
});
