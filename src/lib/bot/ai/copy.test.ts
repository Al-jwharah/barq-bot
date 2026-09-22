import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_DISABLED_AR,
  AI_MISSING_KEY_AR,
  BARQ_AI_BRAND,
  aiReadyGate,
  isLoudAiFailure,
} from "./copy.ts";

test("brand is برق AI only", () => {
  assert.equal(BARQ_AI_BRAND, "برق AI");
  assert.doesNotMatch(BARQ_AI_BRAND, /Grok|xAI|جروك/i);
});

test("missing key fails loudly in Arabic", () => {
  assert.match(AI_MISSING_KEY_AR, /مفتاح الخدمة غير مضبوط/);
  assert.doesNotMatch(AI_MISSING_KEY_AR, /يتهيأ/);
  assert.doesNotMatch(AI_MISSING_KEY_AR, /Grok|xAI|جروك/i);
  assert.equal(aiReadyGate({ enabled: true, hasKey: false }), AI_MISSING_KEY_AR);
  assert.equal(aiReadyGate({ enabled: false, hasKey: true }), AI_DISABLED_AR);
  assert.equal(aiReadyGate({ enabled: true, hasKey: true }), null);
});

test("isLoudAiFailure detects gate messages", () => {
  assert.equal(isLoudAiFailure(AI_MISSING_KEY_AR), true);
  assert.equal(isLoudAiFailure(AI_DISABLED_AR), true);
  assert.equal(isLoudAiFailure("ملخص جميل"), false);
});
