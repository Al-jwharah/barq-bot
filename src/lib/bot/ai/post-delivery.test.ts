import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANALYZE_CALLBACK,
  STUDIO_CALLBACK,
  captionMenuRows,
  postDeliveryAiRows,
  postDeliveryCaption,
} from "./post-delivery.ts";
import { BARQ_AI_BRAND } from "./copy.ts";

test("post-delivery includes لخّصه, caption, analyze, studio", () => {
  const rows = postDeliveryAiRows({ url: "https://x.com/1", duration: 30 }, "https://t.me/share");
  const flat = rows.flat();
  assert.ok(flat.some((b) => b.callback_data === "ai:sum"));
  assert.ok(flat.some((b) => b.callback_data === "ai:cap:menu"));
  assert.ok(flat.some((b) => b.callback_data === ANALYZE_CALLBACK));
  assert.ok(flat.some((b) => b.callback_data === STUDIO_CALLBACK));
  assert.ok(flat.some((b) => b.callback_data === "ai:subs"));
  assert.ok(flat.some((b) => b.url?.includes("t.me")));
});

test("long video adds smart clips button", () => {
  const rows = postDeliveryAiRows({ url: "https://x.com/1", duration: 120 });
  assert.ok(rows.flat().some((b) => b.callback_data === "ai:clips"));
});

test("caption menu has 3 tones", () => {
  assert.equal(captionMenuRows()[0]?.length, 3);
});

test("caption text brands برق AI only", () => {
  const on = postDeliveryCaption(true);
  assert.match(on, new RegExp(BARQ_AI_BRAND));
  assert.doesNotMatch(on, /Grok|xAI|جروك|Barq AI/i);
  assert.equal(postDeliveryCaption(false).includes(BARQ_AI_BRAND), false);
});
