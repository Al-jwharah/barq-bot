import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PLUS_PLAN, PRO_PLAN, MAX_PLAN, SUB_PLANS } from "../bot/plans.ts";
import {
  ADS_ENABLED,
  SUBSCRIPTIONS_LIVE,
  SUBSCRIPTIONS_UI,
  KNOWN_BOOLEAN_FLAGS,
  GROK_MODEL_META,
} from "../bot/config.server.ts";

const ROOT = join(import.meta.dirname, "../..");

test("new product routes exist on disk", () => {
  for (const rel of [
    "routes/login.tsx",
    "routes/register.tsx",
    "routes/pricing.tsx",
    "routes/api/ads.ts",
    "routes/api/pricing-flags.ts",
    "components/site/ad-slot.tsx",
  ]) {
    assert.ok(existsSync(join(ROOT, rel)), rel);
  }
});

test("homepage hero avoids aspect+max-h shrink pattern (RTL gutter)", () => {
  const src = readFileSync(join(ROOT, "routes/index.tsx"), "utf8");
  assert.equal(src.includes("aspect-[9/14]"), false);
  assert.ok(src.includes("aspect-[9/16]"));
  assert.ok(src.includes("w-full"));
  assert.equal(src.includes("max-h-[26rem]"), false);
  assert.ok(src.includes("object-cover object-center"));
  assert.ok(src.includes("منصة برق"));
  assert.ok(src.includes("خارطة الطريق"));
  assert.equal(/مفتاح xAI|Grok|جروك|OpenAI/i.test(src), false);
});

test("pricing aligns with catalog plans and deep-links to bot", () => {
  const src = readFileSync(join(ROOT, "routes/pricing.tsx"), "utf8");
  assert.ok(src.includes(PLUS_PLAN.title) || src.includes("PLUS_PLAN"));
  assert.ok(src.includes("start=sub_"));
  assert.ok(src.includes("BARQ_SUBSCRIPTIONS_LIVE"));
  assert.ok(src.includes("BARQ_SUBSCRIPTIONS_UI"));
  assert.equal(SUB_PLANS.plus.id, "plus");
  assert.equal(PRO_PLAN.id, "pro");
  assert.equal(MAX_PLAN.ai, true);
});

test("auth pages scaffold Telegram + email ENV proposals", () => {
  const login = readFileSync(join(ROOT, "routes/login.tsx"), "utf8");
  const reg = readFileSync(join(ROOT, "routes/register.tsx"), "utf8");
  assert.ok(login.includes("telegram.org/js/telegram-widget"));
  assert.ok(login.includes("BARQ_TELEGRAM_LOGIN_ENABLED"));
  assert.ok(login.includes("BARQ_EMAIL_AUTH_ENABLED"));
  assert.ok(reg.includes("BARQ_EMAIL_AUTH_ENABLED"));
  assert.ok(reg.includes("t.me/barq_ibot"));
});

test("ads + subscriptions flags stay safe by default", () => {
  assert.equal(ADS_ENABLED, false);
  assert.equal(SUBSCRIPTIONS_UI, true);
  assert.equal(SUBSCRIPTIONS_LIVE, false);
  assert.ok(KNOWN_BOOLEAN_FLAGS.includes("BARQ_ADS_ENABLED"));
  assert.ok(KNOWN_BOOLEAN_FLAGS.includes("BARQ_SUBSCRIPTIONS_UI"));
});

test("UI model meta brands as برق AI not Grok", () => {
  assert.equal(GROK_MODEL_META["grok-4.5"].label, "برق AI 4.5");
  assert.equal(GROK_MODEL_META["grok-4"].label.includes("Grok"), false);
});

test("site nav is compact (mobile menu, not many primary pills)", () => {
  const src = readFileSync(join(ROOT, "components/site/site-nav.tsx"), "utf8");
  assert.ok(src.includes("sm:hidden"));
  assert.ok(src.includes("/pricing"));
  assert.ok(src.includes("/login"));
  // Primary list should stay short
  const primaryBlock = src.slice(src.indexOf("PRIMARY"), src.indexOf("] as const"));
  const pills = primaryBlock.match(/to: "/g) ?? [];
  assert.ok(pills.length <= 5, `too many primary pills: ${pills.length}`);
});
