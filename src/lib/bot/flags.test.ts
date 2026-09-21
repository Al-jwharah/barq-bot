import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  ADMIN_LOCK_MINUTES,
  ADMIN_MAX_LOGIN_ATTEMPTS,
  AI_ENABLED,
  AI_MAX_MESSAGE_LENGTH,
  AI_MAX_OUTPUT_TOKENS,
  AI_TIMEOUT_MS,
  BARQ_AI_DAILY,
  BARQ_TIMEZONE,
  CLEANUP_ENABLED,
  COFFEE_ENABLED,
  DAILY_CAP,
  DAILY_CAP_ON,
  DOWNLOAD_TIMEOUT_MS,
  envFlag,
  FILE_RETENTION_DAYS,
  KNOWN_BOOLEAN_FLAGS,
  LAUNCH_MODE,
  LOG_RETENTION_DAYS,
  MAX_CONCURRENT_JOBS,
  MAX_DOWNLOAD_SIZE_MB,
  TELEGRAM_CLOUD_MAX_MB,
  TEMP_FILE_RETENTION_HOURS,
  TEMP_FREE,
  SUBSCRIPTIONS_LIVE,
  VIP_STARS,
  MAX_STARS,
  VAULT_ARCHIVE_ENABLED,
  WATERMARK_ENABLED,
} from "./config.server.ts";

const FLAG = "BARQ_TEST_FLAG_UNIT";

afterEach(() => {
  delete process.env[FLAG];
});

test("envFlag accepts true/false/on/off (and 1/0/yes/no)", () => {
  delete process.env[FLAG];
  assert.equal(envFlag(FLAG, true), true);
  assert.equal(envFlag(FLAG, false), false);

  for (const v of ["1", "true", "on", "yes", "TRUE", "On"]) {
    process.env[FLAG] = v;
    assert.equal(envFlag(FLAG, false), true, v);
  }
  for (const v of ["0", "false", "off", "no", "FALSE", "Off"]) {
    process.env[FLAG] = v;
    assert.equal(envFlag(FLAG, true), false, v);
  }
  process.env[FLAG] = "maybe";
  assert.equal(envFlag(FLAG, true), true);
  assert.equal(envFlag(FLAG, false), false);
});

test("invalid values for known boolean flags throw a clear Error at parse time", () => {
  for (const name of KNOWN_BOOLEAN_FLAGS) {
    const prev = process.env[name];
    process.env[name] = "maybe";
    try {
      assert.throws(
        () => envFlag(name, true),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /Invalid boolean flag/);
          assert.match(err.message, new RegExp(name));
          return true;
        },
        name,
      );
    } finally {
      if (prev == null) delete process.env[name];
      else process.env[name] = prev;
    }
  }
});

test("evaluated config flags keep types and defaults (env already evaluated)", () => {
  assert.equal(typeof DAILY_CAP_ON, "boolean");
  assert.equal(typeof TEMP_FREE, "boolean");
  assert.equal(typeof AI_ENABLED, "boolean");
  assert.equal(typeof VAULT_ARCHIVE_ENABLED, "boolean");
  assert.equal(WATERMARK_ENABLED, false);
  assert.ok(AI_MAX_MESSAGE_LENGTH >= 2000);
  assert.ok(DOWNLOAD_TIMEOUT_MS > 0);
});

test("DAILY_CAP_ON default is true, TEMP_FREE default true, WATERMARK false", () => {
  assert.equal(DAILY_CAP_ON, true);
  assert.equal(TEMP_FREE, true);
  assert.equal(SUBSCRIPTIONS_LIVE, false);
  assert.equal(WATERMARK_ENABLED, false);
});

test("feature flag defaults keep Arabic product identity on", () => {
  assert.equal(VAULT_ARCHIVE_ENABLED, true);
  assert.equal(AI_ENABLED, true);
  assert.equal(COFFEE_ENABLED, true);
  assert.equal(LAUNCH_MODE, true);
  assert.equal(DOWNLOAD_TIMEOUT_MS, 900000);
  assert.equal(MAX_CONCURRENT_JOBS, 3);
  assert.equal(MAX_DOWNLOAD_SIZE_MB, 500);
  assert.equal(TELEGRAM_CLOUD_MAX_MB, 50);
  assert.equal(FILE_RETENTION_DAYS, 7);
  assert.equal(TEMP_FILE_RETENTION_HOURS, 6);
  assert.equal(LOG_RETENTION_DAYS, 30);
  assert.equal(AI_MAX_MESSAGE_LENGTH, 2000);
  assert.equal(AI_MAX_OUTPUT_TOKENS, 700);
  assert.equal(AI_TIMEOUT_MS, 30000);
  assert.equal(ADMIN_MAX_LOGIN_ATTEMPTS, 5);
  assert.equal(ADMIN_LOCK_MINUTES, 15);
  assert.equal(BARQ_TIMEZONE, "Asia/Riyadh");
  assert.equal(CLEANUP_ENABLED, true);
  assert.equal(DAILY_CAP, 5);
  assert.equal(BARQ_AI_DAILY, 10);
  assert.equal(VIP_STARS, 200);
  assert.equal(MAX_STARS, 200);
});
