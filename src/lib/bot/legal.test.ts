import assert from "node:assert/strict";
import { test } from "node:test";
import { LEGAL_BODY, LEGAL_TITLE } from "./legal.ts";

test("LEGAL_BODY includes required policy sections and contacts", () => {
  assert.ok(LEGAL_TITLE.includes("الشروط"));
  assert.ok(LEGAL_BODY.includes("شروط الاستخدام"));
  assert.ok(LEGAL_BODY.includes("الخصوصية"));
  assert.ok(LEGAL_BODY.includes("الاحتفاظ"));
  assert.ok(LEGAL_BODY.includes("حقوق النشر"));
  assert.ok(LEGAL_BODY.includes("المحتوى المحظور"));
  assert.ok(LEGAL_BODY.includes("طلب الحذف"));
  assert.ok(LEGAL_BODY.includes("الإبلاغ"));
  assert.ok(LEGAL_BODY.includes("info@aljwharah.ai"));
  assert.ok(LEGAL_BODY.includes("@i_2169"));
  assert.ok(LEGAL_BODY.includes("24 ساعة"));
  assert.ok(LEGAL_BODY.includes("7 أيام"));
  assert.ok(LEGAL_BODY.includes("30 يوم"));
  assert.ok(LEGAL_BODY.includes("مسؤول"));
  assert.ok(LEGAL_BODY.includes("تنزيل") || LEGAL_BODY.includes("تحميل"));
  assert.equal(LEGAL_BODY.includes("إن الله يراك"), false);
});

test("LEGAL_BODY states clip/file/log retention and user download rights", () => {
  assert.match(LEGAL_BODY, /clips|المقاطع/);
  assert.match(LEGAL_BODY, /24\s*ساعة/);
  assert.match(LEGAL_BODY, /7\s*أيام/);
  assert.match(LEGAL_BODY, /30\s*يوم/);
  assert.match(LEGAL_BODY, /الحق/);
  assert.doesNotMatch(LEGAL_BODY, /إن الله يراك/);
});
