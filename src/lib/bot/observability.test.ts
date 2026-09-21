import assert from "node:assert/strict";
import { test } from "node:test";
import { friendlyError, logJson, redactSecrets } from "./observability.server.ts";

test("friendlyError hides technical noise", () => {
  assert.match(friendlyError(new Error("connect ETIMEDOUT")), /مهلة/);
  assert.match(friendlyError(new Error("HTTP 429 too many")), /كثيرة/);
  assert.match(friendlyError(new Error("عذرًا، لا يمكن")), /عذرًا/);
  assert.match(friendlyError(new Error("socket hang up xyz")), /تعذر تجهيز/);
  assert.equal(friendlyError(new Error("boom\n    at runOnce (worker.ts:1)")).includes("worker.ts"), false);
});

test("redactSecrets strips tokens, urls, and env assignments", () => {
  const db = ["postgres", "://", "u:p@", "host/db"].join("");
  const xai = ["xai-", "abcdefghijklmnop"].join("");
  const tg = ["1234567890", ":AA", "abcdefghijklmnopqrstuvwxyz"].join("");
  assert.equal(redactSecrets(db).includes("postgres://"), false);
  assert.equal(redactSecrets(xai).includes("xai-abcdef"), false);
  assert.equal(redactSecrets(tg).includes(":AA"), false);
  assert.match(redactSecrets("DATABASE_URL=" + db), /DATABASE_URL=\[redacted\]/);
  assert.match(redactSecrets("TELEGRAM_BOT_TOKEN=" + tg), /TELEGRAM_BOT_TOKEN=\[redacted\]/);
  assert.equal(redactSecrets("cleanup ok"), "cleanup ok");
});

test("logJson emits allowed fields and redacts secrets", async () => {
  const lines: string[] = [];
  const orig = console.info;
  console.info = (msg?: unknown) => {
    lines.push(String(msg));
  };
  try {
    await logJson({
      requestId: "req-1",
      jobId: "job-9",
      userId: 42,
      event: "download",
      durationMs: 12,
      status: "ok",
      errorCode: ["postgres", "://", "user:secret@", "db/barq"].join(""),
      files: 3,
      bytes: 40,
    });
  } finally {
    console.info = orig;
  }
  assert.equal(lines.length, 1);
  const row = JSON.parse(lines[0]!) as Record<string, unknown>;
  assert.equal(row.requestId, "req-1");
  assert.equal(row.jobId, "job-9");
  assert.equal(row.userId, "42");
  assert.equal(row.event, "download");
  assert.equal(row.durationMs, 12);
  assert.equal(row.status, "ok");
  assert.equal(row.files, 3);
  assert.equal(row.bytes, 40);
  assert.equal(String(row.errorCode).includes("postgres://"), false);
  assert.equal(String(row.errorCode).includes("secret"), false);
  for (const key of Object.keys(row)) {
    assert.ok(
      [
        "requestId",
        "jobId",
        "userId",
        "event",
        "durationMs",
        "status",
        "errorCode",
        "files",
        "bytes",
        "clips",
        "jobs",
        "logs",
      ].includes(key),
      key,
    );
  }
});
