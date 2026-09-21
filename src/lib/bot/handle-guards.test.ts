import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bannedUserMessage } from "./bans.ts";
import {
  bannedCallbackPermitted,
  bannedMessageAction,
  blocksBannedJob,
  decideHostfile,
  hostfileYieldsToDownload,
  parseJobCancelId,
  parseJobRetryId,
  swallowSideEffect,
} from "./handle-guards.ts";

test("banned users are blocked from new jobs but may cancel", () => {
  assert.equal(blocksBannedJob(true, false), true);
  assert.equal(blocksBannedJob(true, true), false);
  assert.equal(blocksBannedJob(false, false), false);
  assert.equal(bannedCallbackPermitted("job:cancel:abc"), true);
  assert.equal(bannedCallbackPermitted("job:cancel:"), true);
  assert.equal(bannedCallbackPermitted("job:retry:abc"), false);
  assert.equal(bannedCallbackPermitted("go:short"), false);
  assert.equal(bannedCallbackPermitted("adm:home"), false);
});

test("banned message gate keeps appeal and /start, blocks downloads", () => {
  assert.equal(bannedMessageAction("استئناف سبب"), "appeal");
  assert.equal(bannedMessageAction("/appeal"), "appeal");
  assert.equal(bannedMessageAction("/start"), "start");
  assert.equal(bannedMessageAction("/start try"), "start");
  assert.equal(bannedMessageAction("https://tiktok.com/t/abc"), "block");
  assert.equal(bannedMessageAction("رابط مؤقت"), "block");
});

test("hostfile mode yields to http links and slash commands", () => {
  assert.equal(hostfileYieldsToDownload("https://x.com/a/status/1"), true);
  assert.equal(hostfileYieldsToDownload("x.com/a/status/1"), true);
  assert.equal(hostfileYieldsToDownload("/start"), true);
  assert.equal(hostfileYieldsToDownload("سجلي"), true);
  assert.equal(hostfileYieldsToDownload("مرحبا"), false);
  assert.equal(decideHostfile({ text: "https://x.com/a", hasUrl: true, hasFile: false }), "download");
  assert.equal(decideHostfile({ text: "ok", hasUrl: false, hasFile: true }), "upload");
  assert.equal(decideHostfile({ text: "مرحبا", hasUrl: false, hasFile: false }), "wait");
});

test("parseJobCancelId extracts ids and rejects retry/empty", () => {
  assert.equal(parseJobCancelId("job:cancel:deadbeef"), "deadbeef");
  assert.equal(parseJobCancelId("job:cancel:  deadbeef  "), "deadbeef");
  assert.equal(parseJobCancelId("job:cancel:"), null);
  assert.equal(parseJobCancelId("job:retry:deadbeef"), null);
  assert.equal(parseJobRetryId("job:retry:aa"), "aa");
  assert.equal(parseJobRetryId("job:cancel:aa"), null);
});

test("swallowSideEffect never throws (news publish / download side effects)", async () => {
  assert.equal(await swallowSideEffect(async () => 7), 7);
  assert.equal(
    await swallowSideEffect(async () => {
      throw new Error("تعذر النشر في قناة التحديثات");
    }),
    null,
  );
});

test("bannedUserMessage stays Arabic and is what handle uses", () => {
  const msg = bannedUserMessage("i_2169");
  assert.match(msg, /حسابك موقوف/);
  assert.match(msg, /استئناف/);
  assert.match(msg, /@i_2169/);
});

test("handle.server.ts wires guards without a DB-only cancel", () => {
  const src = readFileSync(new URL("./handle.server.ts", import.meta.url), "utf8");
  assert.match(src, /bannedUserMessage/);
  assert.match(src, /blocksBannedJob/);
  assert.match(src, /bannedCallbackPermitted/);
  assert.match(src, /bannedMessageAction/);
  assert.match(src, /parseJobCancelId/);
  assert.match(src, /cancelJob/);
  assert.match(src, /swallowSideEffect/);
  const urlFirst = src.indexOf("const downloadUrls = urlsFromMessage");
  const vault = src.indexOf("bindVaultFromForward");
  const grok = src.indexOf("if (owner && inGrokMode(fromId))");
  assert.ok(urlFirst > 0);
  assert.ok(urlFirst < vault, "video URLs must download before vault bind");
  assert.ok(urlFirst < grok, "video URLs must download before grok mode");
  assert.equal(src.includes("transitionJob"), false);
  assert.match(src, /killJobProcess|cancelJob/);
});
