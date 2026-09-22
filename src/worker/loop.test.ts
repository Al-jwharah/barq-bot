import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkerLoop } from "./loop.ts";

const yieldSleep = async (ms: number) => {
  await new Promise((r) => setTimeout(r, Math.max(1, Math.min(ms, 5))));
};

test("WorkerLoop drains until empty then idles; nudge ends idle", async () => {
  let pending = 3;
  const waves: number[] = [];
  const loop = new WorkerLoop({
    drain: async () => {
      if (pending <= 0) return [{ status: "empty" }];
      pending -= 1;
      waves.push(pending);
      return [{ id: `j${pending}`, status: "completed" }];
    },
    idleMs: () => 20,
    sleep: yieldSleep,
  });

  const run = loop.run();
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(waves.length >= 3, `waves=${waves.length}`);
  assert.ok(loop.stats.claimed >= 3);
  assert.ok(loop.stats.emptyPolls >= 1);
  loop.nudge();
  await loop.stop(1_000);
  await Promise.race([run, new Promise((_, rej) => setTimeout(() => rej(new Error("run hang")), 2000))]);
  assert.equal(loop.stats.running, false);
  assert.equal(loop.stats.shuttingDown, true);
});

test("WorkerLoop dryClaim path uses dryClaim when env on", async () => {
  process.env.BARQ_WORKER_DRY_RUN = "on";
  let calls = 0;
  const loop = new WorkerLoop({
    drain: async () => {
      throw new Error("drain should not run in dry mode");
    },
    dryClaim: async () => {
      calls += 1;
      return calls <= 2 ? { id: `d${calls}`, status: "completed" } : { status: "empty" };
    },
    idleMs: () => 20,
    sleep: yieldSleep,
  });
  const run = loop.run();
  await new Promise((r) => setTimeout(r, 50));
  await loop.stop(1_000);
  await Promise.race([run, new Promise((_, rej) => setTimeout(() => rej(new Error("dry hang")), 2000))]);
  delete process.env.BARQ_WORKER_DRY_RUN;
  assert.ok(calls >= 3, `calls=${calls}`);
  assert.ok(loop.stats.claimed >= 2);
});

test("kick wiring source: queue.server imports external worker flag", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/jobs/queue.server.ts", import.meta.url), "utf8");
  assert.match(src, /BARQ_EXTERNAL_WORKER|externalWorkerEnabled/);
  assert.match(src, /kickOrWakeExternal/);
  assert.match(src, /Architecture B/);
});
