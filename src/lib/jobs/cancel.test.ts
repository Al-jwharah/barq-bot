import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canActorCancel, canTransition } from "./job-status.ts";
import {
  hasJobProcess,
  killJobProcess,
  registerJobTemp,
  setJobChild,
} from "./proc-registry.ts";

test("processing can transition to cancelled", () => {
  assert.equal(canTransition("processing", "cancelled"), true);
});

test("uploading can transition to cancelled", () => {
  assert.equal(canTransition("uploading", "cancelled"), true);
});

test("cancel is owner-only", () => {
  assert.equal(canActorCancel("7", 7, false, "uploading"), true);
  assert.equal(canActorCancel("7", 8, false, "uploading"), false);
  assert.equal(canActorCancel("7", 8, true, "processing"), true);
  assert.equal(canActorCancel("7", 7, false, "completed"), false);
});

test("killJobProcess source sends SIGTERM then SIGKILL", () => {
  const src = readFileSync(new URL("./proc-registry.ts", import.meta.url), "utf8");
  const term = src.indexOf('"SIGTERM"');
  const kill = src.lastIndexOf('"SIGKILL"');
  assert.ok(term >= 0 && kill > term, "SIGTERM must precede SIGKILL");
  assert.match(src, /deleteJobTemps/);
});

test("cancel is not DB-only: worker kill path is wired", () => {
  const queue = readFileSync(new URL("./queue.server.ts", import.meta.url), "utf8");
  assert.match(queue, /killJobProcess/);
  assert.match(queue, /canActorCancel/);
  assert.match(queue, /transitionJob\(id, "cancelled"/);
  assert.equal(/JOB_CANCELLED/.test(queue), false);
});

test("killJobProcess SIGTERM stops a cooperative process", async () => {
  const prev = process.env.JOB_KILL_GRACE_MS;
  process.env.JOB_KILL_GRACE_MS = "250";
  const child = spawn(
    process.execPath,
    ["-e", "process.stdout.write('r'); setInterval(() => {}, 1000)"],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  await new Promise<void>((resolve) => child.stdout!.once("data", () => resolve()));
  assert.ok(child.pid);
  setJobChild("coop", child);
  assert.equal(hasJobProcess("coop"), true);
  const ok = await killJobProcess("coop");
  assert.equal(ok, true);
  if (child.exitCode == null && child.signalCode == null) {
    await new Promise<void>((resolve) => child.once("close", () => resolve()));
  }
  assert.ok(child.signalCode === "SIGTERM" || child.signalCode === "SIGKILL");
  assert.equal(hasJobProcess("coop"), false);
  if (prev == null) delete process.env.JOB_KILL_GRACE_MS;
  else process.env.JOB_KILL_GRACE_MS = prev;
});

test("killJobProcess escalates to SIGKILL when SIGTERM is ignored", async () => {
  const prev = process.env.JOB_KILL_GRACE_MS;
  process.env.JOB_KILL_GRACE_MS = "80";
  const child = spawn(
    process.execPath,
    ["-e", "process.on('SIGTERM', () => {}); process.stdout.write('r'); setInterval(() => {}, 1000)"],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  await new Promise<void>((resolve) => child.stdout!.once("data", () => resolve()));
  assert.ok(child.pid);
  setJobChild("stubborn", child);
  const ok = await killJobProcess("stubborn");
  assert.equal(ok, true);
  if (child.exitCode == null && child.signalCode == null) {
    await new Promise<void>((resolve) => child.once("close", () => resolve()));
  }
  assert.equal(child.signalCode, "SIGKILL");
  if (prev == null) delete process.env.JOB_KILL_GRACE_MS;
  else process.env.JOB_KILL_GRACE_MS = prev;
});

test("killJobProcess deletes registered temp files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "barq-job-"));
  await writeFile(join(dir, "partial.mp4"), "x");
  registerJobTemp("temps", dir);
  const killed = await killJobProcess("temps");
  assert.equal(killed, false);
  await assert.rejects(() => access(dir, constants.F_OK));
});

test("worker documents waitUntil executor and honors MAX_CONCURRENT_JOBS", () => {
  const src = readFileSync(new URL("./worker.server.ts", import.meta.url), "utf8");
  assert.match(src, /waitUntil/);
  assert.match(src, /MAX_CONCURRENT_JOBS/);
  assert.match(src, /dedicated always-on worker|dedicated worker/);
  assert.match(src, /jobTimeoutMs|DOWNLOAD_TIMEOUT/);
  assert.match(src, /killJobProcess/);
  assert.equal(/cluster\.fork|child_process\.fork/.test(src), false);
});
