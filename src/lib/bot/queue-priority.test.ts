import assert from "node:assert/strict";
import { test } from "node:test";
import { queuePriorityFor, workersForLoad } from "./queue-priority.ts";
import { riskFromCounts } from "./risk.server.ts";
import { POINT_REWARDS, REDEEM_COST } from "./points.server.ts";

test("workers scale with pending depth", () => {
  assert.equal(workersForLoad(0), 1);
  assert.equal(workersForLoad(3), 2);
  assert.equal(workersForLoad(10), 3);
  assert.equal(workersForLoad(20), 5);
  assert.equal(workersForLoad(80), 8);
  assert.equal(workersForLoad(80, 3), 3);
});

test("queue priority max > pro > plus > free", () => {
  assert.equal(queuePriorityFor({ owner: true }), 9);
  assert.equal(queuePriorityFor({ tier: "vip" }), 5);
  assert.equal(queuePriorityFor({ tier: "pro" }), 3);
  assert.equal(queuePriorityFor({ subscribed: true }), 2);
  assert.equal(queuePriorityFor({}), 0);
});

test("risk never pauses downloads", () => {
  assert.equal(riskFromCounts({ minute: 2, hour: 4, failed: 0, blocked: 0 }), "ok");
  assert.equal(riskFromCounts({ minute: 12, hour: 12, failed: 0, blocked: 0 }), "ok");
  assert.equal(riskFromCounts({ minute: 40, hour: 40, failed: 0, blocked: 0 }), "ok");
  assert.equal(riskFromCounts({ minute: 99, hour: 99, failed: 99, blocked: 99 }), "ok");
});

test("point rewards and redeem cost", () => {
  assert.equal(POINT_REWARDS.download, 1);
  assert.equal(POINT_REWARDS.invite, 20);
  assert.equal(REDEEM_COST, 100);
});
