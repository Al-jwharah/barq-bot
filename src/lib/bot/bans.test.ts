import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appealDecisionMessage,
  appealReceivedMessage,
  bannedUserMessage,
  isAppealCommand,
  ownerAppealNotice,
  parseAppealNote,
  parseOwnerAppealDecision,
  supportHandle,
} from "./bans.ts";

test("isAppealCommand matches Arabic and slash forms", () => {
  assert.equal(isAppealCommand("استئناف"), true);
  assert.equal(isAppealCommand("استئناف سبب قصير"), true);
  assert.equal(isAppealCommand("/appeal"), true);
  assert.equal(isAppealCommand("/appeal reason"), true);
  assert.equal(isAppealCommand("/appeal@barq_ibot hi"), true);
  assert.equal(isAppealCommand("/start"), false);
  assert.equal(isAppealCommand("رابط فيديو"), false);
});

test("parseAppealNote strips prefix and keeps a fallback", () => {
  assert.equal(parseAppealNote("استئناف خطأ في النظام"), "خطأ في النظام");
  assert.equal(parseAppealNote("/appeal please"), "please");
  assert.equal(parseAppealNote("/appeal"), "طلب استئناف");
  assert.equal(parseAppealNote("استئناف"), "طلب استئناف");
});

test("banned and appeal copy stays Arabic and names support", () => {
  const msg = bannedUserMessage("i_2169");
  assert.match(msg, /حسابك موقوف/);
  assert.match(msg, /استئناف/);
  assert.match(msg, /@i_2169/);
  assert.equal(bannedUserMessage("@i_2169").includes("@@"), false);
  assert.equal(appealReceivedMessage(true, "i_2169"), "وصل طلب الاستئناف. الدعم يراجعه.");
  assert.match(appealReceivedMessage(false, "i_2169"), /@i_2169/);
  assert.equal(supportHandle("@i_2169"), "i_2169");
});

test("owner decision copy", () => {
  assert.equal(appealDecisionMessage(true, "99", true), "قُبل الاستئناف وفُك الحظر عن 99");
  assert.equal(appealDecisionMessage(false, "99", true), "رُفض استئناف 99");
  assert.equal(appealDecisionMessage(true, "99", false), "لا استئناف مفتوح");
  const notice = ownerAppealNotice("99", "سبب");
  assert.match(notice, /\/appealok 99/);
  assert.match(notice, /\/appealno 99/);
  assert.deepEqual(parseOwnerAppealDecision("/appealok 99"), { accept: true, tgId: "99" });
  assert.deepEqual(parseOwnerAppealDecision("/appealno 12345"), { accept: false, tgId: "12345" });
  assert.equal(parseOwnerAppealDecision("/appeal 99"), null);
});
