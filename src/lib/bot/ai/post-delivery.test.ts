import assert from "node:assert/strict";
import { test } from "node:test";
import { captionMenuRows, postDeliveryAiRows, postDeliveryCaption } from "./post-delivery.ts";

test("post-delivery includes لخّصه and caption menu", () => {
  const rows = postDeliveryAiRows({ url: "https://x.com/1", duration: 30 }, "https://t.me/share", {
    shortLinks: false,
    aiReady: true,
  });
  const flat = rows.flat();
  assert.ok(flat.some((b) => b.callback_data === "ai:sum"));
  assert.ok(flat.some((b) => b.callback_data === "ai:cap:menu"));
  assert.equal(flat.some((b) => b.callback_data === "go:short"), false);
  assert.ok(flat.some((b) => b.url?.includes("t.me")));
});

test("short link CTA only when advertised", () => {
  const off = postDeliveryAiRows({ url: "https://x.com/1", duration: 30 }, undefined, {
    shortLinks: false,
    aiReady: true,
  });
  const on = postDeliveryAiRows({ url: "https://x.com/1", duration: 30 }, undefined, {
    shortLinks: true,
    aiReady: true,
  });
  assert.equal(off.flat().some((b) => b.callback_data === "go:short"), false);
  assert.ok(on.flat().some((b) => b.callback_data === "go:short"));
});

test("aiReady false hides AI buttons", () => {
  const rows = postDeliveryAiRows({ url: "https://x.com/1", duration: 120 }, "https://t.me/share", {
    shortLinks: true,
    aiReady: false,
  });
  const flat = rows.flat();
  assert.equal(flat.some((b) => b.callback_data?.startsWith("ai:")), false);
  assert.ok(flat.some((b) => b.callback_data === "go:short"));
  assert.ok(flat.some((b) => b.url?.includes("t.me")));
});

test("long video adds smart clips button", () => {
  const rows = postDeliveryAiRows({ url: "https://x.com/1", duration: 120 }, undefined, {
    shortLinks: false,
    aiReady: true,
  });
  assert.ok(rows.flat().some((b) => b.callback_data === "ai:clips"));
});

test("caption menu has 3 tones", () => {
  assert.equal(captionMenuRows()[0]?.length, 3);
});

test("caption text brands برق AI without promising short link", () => {
  assert.match(postDeliveryCaption(true), /برق AI/);
  assert.equal(/رابط مختصر/.test(postDeliveryCaption(true)), false);
  assert.equal(postDeliveryCaption(false).includes("برق AI"), false);
});
