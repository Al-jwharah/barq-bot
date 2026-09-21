import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, utimesSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  fileRetentionDays,
  logRetentionDays,
  pruneLocalFiles,
  runCleanup,
  shouldRunCleanup,
  tempRetentionHours,
} from "./cleanup.server.ts";

const KEY = "CLEANUP_ENABLED";
const previous = process.env[KEY];
const prevFile = process.env.FILE_RETENTION_DAYS;
const prevTemp = process.env.TEMP_FILE_RETENTION_HOURS;
const prevLog = process.env.LOG_RETENTION_DAYS;

afterEach(() => {
  if (previous == null) delete process.env[KEY];
  else process.env[KEY] = previous;
  if (prevFile == null) delete process.env.FILE_RETENTION_DAYS;
  else process.env.FILE_RETENTION_DAYS = prevFile;
  if (prevTemp == null) delete process.env.TEMP_FILE_RETENTION_HOURS;
  else process.env.TEMP_FILE_RETENTION_HOURS = prevTemp;
  if (prevLog == null) delete process.env.LOG_RETENTION_DAYS;
  else process.env.LOG_RETENTION_DAYS = prevLog;
});

test("shouldRunCleanup is false for 0/false/off", () => {
  for (const v of ["0", "false", "off", "FALSE", "Off", "no"]) {
    process.env[KEY] = v;
    assert.equal(shouldRunCleanup(), false, v);
  }
});

test("shouldRunCleanup is true by default and for on/1/true", () => {
  delete process.env[KEY];
  assert.equal(shouldRunCleanup(), true);
  for (const v of ["1", "true", "on", "yes", "TRUE", "On"]) {
    process.env[KEY] = v;
    assert.equal(shouldRunCleanup(), true, v);
  }
});

test("runCleanup returns zeros when CLEANUP_ENABLED is off", async () => {
  for (const v of ["off", "0", "false"]) {
    process.env[KEY] = v;
    assert.deepEqual(await runCleanup(), { clips: 0, jobs: 0, logs: 0, files: 0, bytes: 0 }, v);
  }
});

test("retention env defaults and overrides", () => {
  delete process.env.FILE_RETENTION_DAYS;
  delete process.env.TEMP_FILE_RETENTION_HOURS;
  delete process.env.LOG_RETENTION_DAYS;
  assert.equal(fileRetentionDays(), 7);
  assert.equal(tempRetentionHours(), 6);
  assert.equal(logRetentionDays(), 30);
  process.env.FILE_RETENTION_DAYS = "14";
  process.env.TEMP_FILE_RETENTION_HOURS = "2";
  process.env.LOG_RETENTION_DAYS = "10";
  assert.equal(fileRetentionDays(), 14);
  assert.equal(tempRetentionHours(), 2);
  assert.equal(logRetentionDays(), 10);
});

test("pruneLocalFiles deletes expired temp and job dirs and counts files/bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "barq-cleanup-unit-"));
  process.env.TEMP_FILE_RETENTION_HOURS = "1";
  process.env.FILE_RETENTION_DAYS = "1";
  try {
    const oldTemp = join(root, "barq-oldxyz");
    mkdirSync(oldTemp);
    writeFileSync(join(oldTemp, "clip.bin"), "abcd");
    const oldWm = join(root, "barqwm-stale");
    mkdirSync(oldWm);
    writeFileSync(join(oldWm, "in.mp4"), "123456");
    const fresh = join(root, "barq-freshxyz");
    mkdirSync(fresh);
    writeFileSync(join(fresh, "keep.bin"), "keep");
    const jobs = join(root, "jobs");
    mkdirSync(jobs);
    writeFileSync(join(jobs, "done.bin"), "zzzz");

    const ancient = (Date.now() - 8 * 3600 * 1000) / 1000;
    const twoDays = (Date.now() - 48 * 3600 * 1000) / 1000;
    utimesSync(oldTemp, ancient, ancient);
    utimesSync(oldWm, ancient, ancient);
    utimesSync(jobs, twoDays, twoDays);

    const first = await pruneLocalFiles(root);
    assert.ok(first.files >= 3);
    assert.ok(first.bytes >= 14);
    assert.equal(existsSync(oldTemp), false);
    assert.equal(existsSync(oldWm), false);
    assert.equal(existsSync(jobs), false);
    assert.equal(existsSync(fresh), true);

    const second = await pruneLocalFiles(root);
    assert.deepEqual(second, { files: 0, bytes: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
