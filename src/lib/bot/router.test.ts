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

test("Barq AI => ai", () => {
  assert.equal(classifyIntent({ text: "Barq AI", urls: [], hasFile: false }), "ai");
});

test("لخّصه / كابشن => ai", () => {
  assert.equal(classifyIntent({ text: "لخّصه", urls: [], hasFile: false }), "ai");
  assert.equal(classifyIntent({ text: "كابشن", urls: [], hasFile: false }), "ai");
});

test("/live @x => live", () => {
  assert.equal(classifyIntent({ text: "/live @x", urls: [], hasFile: false }), "live");
});

test("رابط مؤقت => short", () => {
  assert.equal(classifyIntent({ text: "رابط مؤقت", urls: [], hasFile: false }), "short");
});

test("رفع ملف is not a download", () => {
  assert.equal(classifyIntent({ text: "رفع ملف", urls: [], hasFile: false }), "other");
});

test("hello => other", () => {
  assert.equal(classifyIntent({ text: "hello", urls: [], hasFile: false }), "other");
});
