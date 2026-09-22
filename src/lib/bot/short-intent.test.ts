import assert from "node:assert/strict";
import { test } from "node:test";
import { isShortLinkIntent, SHORT_LINK_BTN, SHORT_LINK_BTN_LEGACY } from "./short-intent";

test("button labels are short intents", () => {
  assert.equal(isShortLinkIntent(SHORT_LINK_BTN), true);
  assert.equal(isShortLinkIntent(SHORT_LINK_BTN_LEGACY), true);
});

test("owner synonyms: اختصار / رابط مختصر", () => {
  assert.equal(isShortLinkIntent("اختصار"), true);
  assert.equal(isShortLinkIntent("رابط مختصر"), true);
  assert.equal(isShortLinkIntent("اختصر الرابط"), true);
  assert.equal(isShortLinkIntent("/short"), true);
  assert.equal(isShortLinkIntent("/short@barq_bot"), true);
});

test("non-short stay false", () => {
  assert.equal(isShortLinkIntent("حسابي"), false);
  assert.equal(isShortLinkIntent("https://tiktok.com/x"), false);
  assert.equal(isShortLinkIntent(""), false);
});
