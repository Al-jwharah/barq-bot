import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BARQ_AI_BRAND,
  emptyStateGenericAr,
  emptyStateNoClipAr,
  helpCaption,
  publicStartCaption,
  shortLinkBlobDownAr,
  shortLinkCreatedAr,
  shortLinkNeedMediaAr,
} from "./copy.ts";

test("start/help are premium Saudi Arabic — brand برق AI, no apology spam", () => {
  const start = publicStartCaption({ free: 10, channel: "barq_all", support: "i_2169" });
  const help = helpCaption({ support: "i_2169", channel: "barq_all", free: 10 });
  for (const msg of [start, help]) {
    assert.match(msg, /[\u0600-\u06FF]/);
    assert.match(msg, /برق/);
    assert.equal(/تجريبي|beta|عذرًا على|قريبًا جدًا|نعمل على إصلاح/i.test(msg), false);
    assert.equal(msg.includes("Grok"), false);
    assert.equal(msg.includes("xAI"), false);
    assert.equal(msg.includes("Barq AI"), false);
    assert.equal(msg.includes("Vercel"), false);
  }
  assert.match(start, new RegExp(BARQ_AI_BRAND));
  assert.match(help, new RegExp(BARQ_AI_BRAND));
});

test("empty + short-link helpers are Arabic and non-technical", () => {
  for (const msg of [
    emptyStateNoClipAr(),
    emptyStateGenericAr(),
    shortLinkNeedMediaAr(),
    shortLinkCreatedAr("https://example.com/d/abc", "تيك توك"),
    shortLinkBlobDownAr(),
  ]) {
    assert.match(msg, /[\u0600-\u06FF]/);
    assert.equal(/vercel|blob:|suspended|stack|ECONN|Grok|xAI/i.test(msg), false);
  }
});
