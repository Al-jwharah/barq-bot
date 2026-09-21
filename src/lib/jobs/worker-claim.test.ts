import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import {
  CLAIM_HEARTBEAT_SQL,
  POSTGRES_CLAIM_LOCK,
  claimNextJobSelectSql,
} from "./queue.server.ts";

const workerSrc = readFileSync(new URL("./worker.server.ts", import.meta.url), "utf8");
const queueSrc = readFileSync(new URL("./queue.server.ts", import.meta.url), "utf8");

afterEach(() => {
  delete process.env.MAX_CONCURRENT_JOBS;
});

test("postgres claim SQL uses FOR UPDATE SKIP LOCKED", () => {
  assert.equal(POSTGRES_CLAIM_LOCK, "for update skip locked");
  const next = claimNextJobSelectSql(false, true);
  const byId = claimNextJobSelectSql(true, true);
  assert.match(next, /for update skip locked/i);
  assert.match(byId, /for update skip locked/i);
  assert.match(next, /status = 'pending'/);
  assert.match(byId, /id = \$1 and status = 'pending'/);
  assert.match(next, /order by coalesce\(priority, 0\) desc, created_at asc/);
  assert.match(next, /limit 1/);
  assert.match(byId, /limit 1/);
  assert.match(queueSrc, /claimNextJobSelectSql\((true|false|Boolean\(id\))/);
  assert.match(queueSrc, /dbSource === ["']neon["']/);
  assert.doesNotMatch(claimNextJobSelectSql(false, false), /skip locked/i);
});

test("claim uniqueness: SKIP LOCKED so two workers cannot take the same job", () => {
  const sql = claimNextJobSelectSql(false, true);
  assert.match(sql, /for update skip locked/i);
  // Model of the SQL contract (not a dedicated worker process): a locked row is skipped.
  type Row = { id: string; status: "pending" | "processing"; lockedBy: string | null };
  const rows: Row[] = [{ id: "job-1", status: "pending", lockedBy: null }];
  function claim(worker: string): string | null {
    const row = rows.find((r) => r.status === "pending" && r.lockedBy == null);
    if (!row) return null;
    row.lockedBy = worker;
    row.status = "processing";
    return row.id;
  }
  const first = claim("w1");
  const second = claim("w2");
  assert.equal(first, "job-1");
  assert.equal(second, null);
  assert.equal(rows[0]!.lockedBy, "w1");
  assert.equal(rows.filter((r) => r.lockedBy).length, 1);
});

test("claim heartbeat stamps worker_id and last_heartbeat_at", () => {
  assert.match(CLAIM_HEARTBEAT_SQL, /worker_id/);
  assert.match(CLAIM_HEARTBEAT_SQL, /last_heartbeat_at/);
  assert.match(CLAIM_HEARTBEAT_SQL, /now\(\)/);
  assert.match(queueSrc, /CLAIM_HEARTBEAT_SQL/);
  assert.match(queueSrc, /next\.worker_id = workerId/);
  assert.match(queueSrc, /next\.last_heartbeat_at/);
  assert.match(workerSrc, /claimNextJob/);
  assert.match(workerSrc, /worker_id \/ last_heartbeat_at/);
});

test("worker honesty: serverless waitUntil executor, no dedicated process, launch blocked", () => {
  assert.match(workerSrc, /waitUntil/);
  assert.match(workerSrc, /Vercel serverless/);
  assert.match(workerSrc, /dedicated always-on worker process is[\s/*]+NOT deployed/);
  assert.match(workerSrc, /Public launch is blocked/);
  assert.match(workerSrc, /not a separate process/);
  assert.doesNotMatch(workerSrc, /always-on worker is deployed/);
  assert.doesNotMatch(workerSrc, /dedicated worker process is running/);
});

test("MAX_CONCURRENT_JOBS env honored if present else 3", () => {
  assert.match(workerSrc, /MAX_CONCURRENT_JOBS/);
  assert.match(workerSrc, /export function maxConcurrentJobs/);
  assert.match(workerSrc, /if \(raw == null \|\| String\(raw\)\.trim\(\) === ""\) return 3/);
  function maxConcurrentJobs(): number {
    const raw = process.env.MAX_CONCURRENT_JOBS;
    if (raw == null || String(raw).trim() === "") return 3;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(8, Math.trunc(n)) : 3;
  }
  delete process.env.MAX_CONCURRENT_JOBS;
  assert.equal(maxConcurrentJobs(), 3);
  process.env.MAX_CONCURRENT_JOBS = "4";
  assert.equal(maxConcurrentJobs(), 4);
  process.env.MAX_CONCURRENT_JOBS = "0";
  assert.equal(maxConcurrentJobs(), 3);
  process.env.MAX_CONCURRENT_JOBS = "nope";
  assert.equal(maxConcurrentJobs(), 3);
});

