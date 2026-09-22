import assert from "node:assert/strict";
import { test } from "node:test";
import { captionMenuRows, postDeliveryAiRows, postDeliveryCaption } from "./post-delivery.ts";

test("post-delivery includes لخّصه and caption menu", () => {
  const rows = postDeliveryAiRows({ url: "https://x.com/1", duration: 30 }, "https://t.me/share");
  const flat = rows.flat();
  assert.ok(flat.some((b) => b.callback_data === "ai:sum"));
  assert.ok(flat.some((b) => b.callback_data === "ai:cap:menu"));
  assert.ok(flat.some((b) => b.callback_data === "go:short"));
  assert.ok(flat.some((b) => b.url?.includes("t.me")));
});

test("long video adds smart clips button", () => {
  const rows = postDeliveryAiRows({ url: "https://x.com/1", duration: 120 });
  assert.ok(rows.flat().some((b) => b.callback_data === "ai:clips"));
});

test("caption menu has 3 tones", () => {
  assert.equal(captionMenuRows()[0]?.length, 3);
});

test("caption text brands برق AI and offers short link", () => {
  assert.match(postDeliveryCaption(true), /برق AI/);
  assert.match(postDeliveryCaption(true), /رابط مختصر/);
  assert.equal(postDeliveryCaption(false).includes("Barq AI"), false);
  assert.match(postDeliveryCaption(false), /رابط مختصر/);
});
