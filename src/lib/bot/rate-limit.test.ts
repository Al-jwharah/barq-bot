import assert from "node:assert/strict";
import { test } from "node:test";
import {
  degradedRateResult,
  isRateLimitStrict,
  rateLimitLogin,
  rateLimitUser,
  RATE_WINDOWS,
} from "./rate-limit.server.ts";

test("rate windows are 8 msgs/min, 20 links/hour, admin 5 tries / 15 min", () => {
  assert.equal(RATE_WINDOWS.msgsPerMinute, 8);
  assert.equal(RATE_WINDOWS.linksPerHour, 20);
  assert.equal(RATE_WINDOWS.adminTries, 5);
  assert.equal(RATE_WINDOWS.adminLockMinutes, 15);
});

test("rate limiter allows a burst then blocks", async () => {
  const id = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let blocked = false;
  for (let i = 0; i < 12; i += 1) {
    const r = await rateLimitUser(id, "link");
    if (!r.ok) {
      blocked = true;
      assert.ok(r.retryAfter >= 1);
      break;
    }
  }
  assert.equal(blocked, true);
});

test("msg kind blocks after 8 in a minute", async () => {
  const id = `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let allowed = 0;
  let blocked = false;
  for (let i = 0; i < 12; i += 1) {
    const r = await rateLimitUser(id, "msg");
    if (r.ok) allowed += 1;
    else {
      blocked = true;
      assert.ok(r.retryAfter >= 1);
      break;
    }
  }
  assert.equal(allowed, 8);
  assert.equal(blocked, true);
});

test("admin login lock is 5 tries then wait", async () => {
  const key = `pin-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let blocked: { ok: boolean; retryAfter: number } | null = null;
  for (let i = 0; i < 6; i += 1) {
    const r = await rateLimitLogin(key);
    if (!r.ok) {
      blocked = r;
      break;
    }
  }
  assert.ok(blocked);
  assert.equal(blocked!.ok, false);
  assert.ok(blocked!.retryAfter >= 1);
});

test("production SQL failure is degraded, not an in-memory counter", () => {
  assert.equal(isRateLimitStrict({ NODE_ENV: "production" }), true);
  assert.equal(isRateLimitStrict({ BARQ_REQUIRE_POSTGRES: "true" }), true);
  const user = degradedRateResult("msg");
  assert.equal(user.degraded, true);
  assert.equal(user.ok, true);
  assert.equal(user.reason, "degraded");
  const login = degradedRateResult("login");
  assert.equal(login.degraded, true);
  assert.equal(login.ok, false);
  assert.ok(login.retryAfter >= 60);
});

test("non-production is not strict so tests can use memory fallback", () => {
  assert.equal(isRateLimitStrict({ NODE_ENV: "test" }), false);
  assert.equal(isRateLimitStrict({}), false);
});
