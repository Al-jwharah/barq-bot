import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyIntent } from "./router.ts";

test("x.com URL + pending hostfile => download", () => {
  assert.equal(
    classifyIntent({
      text: "https://x.com/a/status/1",
      urls: ["https://x.com/a/status/1"],
      hasFile: false,
      pending: "hostfile",
    }),
    "download",
  );
});

test("tiktok URL => download", () => {
  assert.equal(
    classifyIntent({
      text: "https://vt.tiktok.com/x",
      urls: ["https://vt.tiktok.com/x"],
      hasFile: false,
    }),
    "download",
  );
});

test("hasFile true, no url, pending hostfile => upload", () => {
  assert.equal(
    classifyIntent({ text: "ok", urls: [], hasFile: true, pending: "hostfile" }),
    "upload",
  );
});

test("/start => start", () => {
  assert.equal(classifyIntent({ text: "/start", urls: [], hasFile: false }), "start");
});

test("نقاطي => points", () => {
  assert.equal(classifyIntent({ text: "نقاطي", urls: [], hasFile: false }), "points");
});

test("حسابي => account", () => {
  assert.equal(classifyIntent({ text: "حسابي", urls: [], hasFile: false }), "account");
});

test("Barq AI / برق AI => ai", () => {
  assert.equal(classifyIntent({ text: "Barq AI", urls: [], hasFile: false }), "ai");
  assert.equal(classifyIntent({ text: "برق AI", urls: [], hasFile: false }), "ai");
});

test("/live @x => live", () => {
  assert.equal(classifyIntent({ text: "/live @x", urls: [], hasFile: false }), "live");
});

test("رابط مؤقت => short", () => {
  assert.equal(classifyIntent({ text: "رابط مؤقت", urls: [], hasFile: false }), "short");
});

test("hello => other", () => {
  assert.equal(classifyIntent({ text: "hello", urls: [], hasFile: false }), "other");
});

test("/ai لخص => ai", () => {
  assert.equal(classifyIntent({ text: "/ai لخص المقطع", urls: [], hasFile: false }), "ai");
});

test("/grok => ai", () => {
  assert.equal(classifyIntent({ text: "/grok", urls: [], hasFile: false }), "ai");
});

test("اختصار / رابط مختصر => short", () => {
  assert.equal(classifyIntent({ text: "اختصار", urls: [], hasFile: false }), "short");
  assert.equal(classifyIntent({ text: "رابط مختصر", urls: [], hasFile: false }), "short");
  assert.equal(classifyIntent({ text: "/اختصار", urls: [], hasFile: false }), "short");
});

test("isShortCommand aliases", async () => {
  const { isShortCommand } = await import("./router.ts");
  assert.equal(isShortCommand("اختصار"), true);
  assert.equal(isShortCommand("رابط مختصر"), true);
  assert.equal(isShortCommand("مرحبا"), false);
});
