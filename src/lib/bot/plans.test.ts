import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_PLAN,
  PLUS_PLAN,
  catalogText,
  parseSubPayload,
  planById,
  starsForSar,
  subInvoicePayload,
} from "./plans.ts";

test("4.99 SAR is 50 stars and 19.99 SAR is 200 stars", () => {
  assert.equal(starsForSar(4.99), 50);
  assert.equal(starsForSar(19.99), 200);
  assert.equal(PLUS_PLAN.stars, 50);
  assert.equal(PLUS_PLAN.sar, "4.99");
  assert.equal(MAX_PLAN.stars, 200);
  assert.equal(MAX_PLAN.sar, "19.99");
  assert.equal(MAX_PLAN.youtube, true);
  assert.equal(MAX_PLAN.ai, true);
  assert.equal(PLUS_PLAN.youtube, false);
  assert.equal(PLUS_PLAN.ai, false);
});

test("payload encodes plan and parseSubPayload reads it", () => {
  const payload = subInvoicePayload("max", 8471762251);
  assert.match(payload, /^sub:max:8471762251:/);
  assert.equal(parseSubPayload(payload), "max");
  assert.equal(parseSubPayload("sub:plus:1:9"), "plus");
  assert.equal(parseSubPayload("sub:pro:1:9"), "pro");
  assert.equal(parseSubPayload("tip:1:50"), undefined);
  assert.equal(planById("vip")?.id, "max");
  assert.equal(planById("pro")?.id, "pro");
  assert.equal(planById("season")?.days, 90);
});

test("catalog stays unlaunched copy when live is false", () => {
  const text = catalogText(false);
  assert.match(text, /غير مفعّلة/);
  assert.match(text, /4\.99/);
  assert.match(text, /19\.99/);
  assert.match(text, /50 نجمة/);
  assert.match(text, /200 نجمة/);
  assert.equal(catalogText(true).includes("غير مفعّلة"), false);
});
