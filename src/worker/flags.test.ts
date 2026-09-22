import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  externalWorkerEnabled,
  workerDryRunEnabled,
  workerIdleMs,
  workerPort,
  workerWakeUrl,
} from "./flags.ts";

afterEach(() => {
  delete process.env.BARQ_EXTERNAL_WORKER;
  delete process.env.WORKER_WAKE_URL;
  delete process.env.BARQ_WORKER_DRY_RUN;
  delete process.env.WORKER_IDLE_MS;
  delete process.env.PORT;
  delete process.env.WORKER_PORT;
});

test("BARQ_EXTERNAL_WORKER on|1|true enables; else off", () => {
  assert.equal(externalWorkerEnabled(), false);
  process.env.BARQ_EXTERNAL_WORKER = "on";
  assert.equal(externalWorkerEnabled(), true);
  process.env.BARQ_EXTERNAL_WORKER = "OFF";
  assert.equal(externalWorkerEnabled(), false);
  process.env.BARQ_EXTERNAL_WORKER = "1";
  assert.equal(externalWorkerEnabled(), true);
  process.env.BARQ_EXTERNAL_WORKER = "true";
  assert.equal(externalWorkerEnabled(), true);
});

test("workerWakeUrl reads WORKER_WAKE_URL as-is", () => {
  assert.equal(workerWakeUrl(), "");
  process.env.WORKER_WAKE_URL = "https://barq-worker.fly.dev/wake";
  assert.equal(workerWakeUrl(), "https://barq-worker.fly.dev/wake");
});

test("dry-run and idle/port defaults", () => {
  assert.equal(workerDryRunEnabled(), false);
  process.env.BARQ_WORKER_DRY_RUN = "on";
  assert.equal(workerDryRunEnabled(), true);
  assert.equal(workerIdleMs(), 1500);
  process.env.WORKER_IDLE_MS = "500";
  assert.equal(workerIdleMs(), 500);
  assert.equal(workerPort(), 8080);
  process.env.PORT = "9090";
  assert.equal(workerPort(), 9090);
});
