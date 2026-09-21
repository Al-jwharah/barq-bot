import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { botDeepLink, channelUrl, clipCaption, FUN_SIGNATURES, normalizeChannel, TRY_BOT_LABEL } from "./brand";

describe("clipCaption", () => {
  it("rotates funny signatures and never includes the source url", () => {
    const a = clipCaption("barq_ibot", "video", "tiktok", "https://vt.tiktok.com/x", 0);
    const b = clipCaption("barq_ibot", "video", "tiktok", "https://vt.tiktok.com/x", 1);
    assert.match(a, /@barq_ibot/);
    assert.match(b, /@barq_ibot/);
    assert.notEqual(a, b);
    assert.equal(FUN_SIGNATURES.length >= 8, true);
    assert.ok(FUN_SIGNATURES.some((s) => s.includes("كنتاكي")));
    for (let i = 0; i < FUN_SIGNATURES.length; i += 1) {
      const cap = clipCaption("barq_ibot", "video", "tiktok", "https://vt.tiktok.com/x", i);
      assert.doesNotMatch(cap, /https?:/);
      assert.doesNotMatch(cap, /vt\.tiktok/);
      assert.match(cap, /@barq_ibot/);
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
