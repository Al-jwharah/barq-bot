import assert from "node:assert/strict";
import { test } from "node:test";
import { assertAgentMayRun } from "./agent-tools.server.ts";
import {
  callsForIntent,
  needsConfirmation,
  parseAgentIntent,
} from "./agent-protocol.ts";
import { entitlementsFor, tierFromMember } from "./premium.ts";
import { starsMatchPlan, validateCatalogPayment } from "./payment-validation.ts";
import { paypalEnabled, verifyPaypalEvent } from "./paypal.server.ts";

test("free stays a downloader and max is the only analysis tier", () => {
  const free = entitlementsFor("free");
  const max = entitlementsFor(tierFromMember("vip", true));
  assert.equal(free.dailyCap > 0, true);
  assert.equal(free.analysis, false);
  assert.equal(free.studio, false);
  assert.equal(max.analysis, true);
  assert.equal(max.workspace, true);
  assert.equal(tierFromMember("plus", false), "free");
});

test("agent rejects admin tools for a normal user", () => {
  assert.throws(() => assertAgentMayRun("user", "grant_days"), /صلاحية|forbidden_tool/);
  assert.throws(() => assertAgentMayRun("user", "set_subscription"), /صلاحية|forbidden_tool/);
  assert.doesNotThrow(() => assertAgentMayRun("user", "inspect_url"));
});

test("download is planned but waits for confirmation", () => {
  const intent = parseAgentIntent("حمل https://www.tiktok.com/@a/video/123");
  assert.equal(intent.kind, "download");
  const calls = callsForIntent(intent, null);
  assert.equal(calls[0]?.name, "start_download");
  assert.equal(needsConfirmation("start_download"), true);
  assert.equal(needsConfirmation("inspect_url"), false);
});

test("paypal amount must match the catalog plan", () => {
  const bad = validateCatalogPayment({
    planId: "plus",
    amount: "1.00",
    currency: "USD",
    orderId: "ord_1",
    payerId: "payer",
  });
  assert.equal(bad.ok, false);
  const good = validateCatalogPayment({
    planId: "plus",
    amount: "4.99",
    currency: "SAR",
    orderId: "ord_1",
    payerId: "payer",
  });
  assert.equal(good.ok, true);
  assert.equal(starsMatchPlan("sub:max:1:9", 200)?.id, "max");
  assert.equal(starsMatchPlan("sub:plus:1:9", 200), null);
});

test("paypal webhook stays disabled without credentials and rejects replays", () => {
  const prev = process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
  delete process.env.PAYPAL_WEBHOOK_ID;
  assert.equal(paypalEnabled(), false);
  const off = verifyPaypalEvent({ enabled: false, eventId: "evt", transmissionSig: "sig" });
  assert.equal(off.ok, false);
  if (!off.ok) assert.equal(off.reason, "paypal_disabled");
  const replay = verifyPaypalEvent({
    enabled: true,
    eventId: "evt",
    eventType: "PAYMENT.CAPTURE.COMPLETED",
    webhookId: "wh",
    expectedWebhookId: "wh",
    transmissionSig: "sig",
    planId: "plus",
    amount: "4.99",
    currency: "SAR",
    payerId: "p",
    orderId: "o",
    seen: true,
  });
  assert.equal(replay.ok, false);
  if (prev) process.env.PAYPAL_CLIENT_ID = prev;
});
