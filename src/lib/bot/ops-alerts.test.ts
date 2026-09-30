import assert from "node:assert/strict";
import { test } from "node:test";
import {
  failRateAlertThreshold,
  processedFromJobCounts,
  shouldAlertHourlyFailRate,
} from "./ops-metrics.ts";

test("processedFromJobCounts sums completed + expired from DB aggregates", () => {
  assert.equal(processedFromJobCounts({ completed: 0, expired: 0 }), 0);
  assert.equal(processedFromJobCounts({ completed: 12, expired: 3 }), 15);
  assert.equal(processedFromJobCounts({ completed: 7, expired: 0 }), 7);
});

test("failRateAlertThreshold defaults and parses env", () => {
  assert.equal(failRateAlertThreshold(""), 0.35);
  assert.equal(failRateAlertThreshold(undefined), 0.35);
  assert.equal(failRateAlertThreshold("0.5"), 0.5);
  assert.equal(failRateAlertThreshold("25"), 0.25);
  assert.equal(failRateAlertThreshold("nope"), 0.35);
});

test("shouldAlertHourlyFailRate respects min samples and threshold", () => {
  assert.equal(
    shouldAlertHourlyFailRate({ failed: 4, finished: 4, threshold: 0.35, minSamples: 5 }),
    false,
  );
  assert.equal(
    shouldAlertHourlyFailRate({ failed: 2, finished: 10, threshold: 0.35 }),
    false,
  );
  assert.equal(
    shouldAlertHourlyFailRate({ failed: 4, finished: 10, threshold: 0.35 }),
    true,
  );
  assert.equal(
    shouldAlertHourlyFailRate({ failed: 5, finished: 5, threshold: 0.35 }),
    true,
  );
});
