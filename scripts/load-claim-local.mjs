#!/usr/bin/env node
/**
 * Local claim/drain concurrency against a throwaway in-memory queue.
 * Models Postgres FOR UPDATE SKIP LOCKED: two claimers never get the same id.
 * Does not touch production DATABASE_URL or Telegram.
 *
 * Usage:
 *   node scripts/load-claim-local.mjs
 *   node scripts/load-claim-local.mjs --json
 */
import { performance } from "node:perf_hooks";

const LEVELS = [10, 25, 50];
const jsonOnly = process.argv.includes("--json");

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[idx];
}

/** Minimal SKIP LOCKED queue. */
function makeQueue(pendingCount) {
  /** @type {{ id: string, status: 'pending'|'processing'|'completed', lockedBy: string|null }[]} */
  const rows = Array.from({ length: pendingCount }, (_, i) => ({
    id: `job-${String(i).padStart(4, "0")}`,
    status: "pending",
    lockedBy: null,
  }));
  let gate = Promise.resolve();
  function withLock(fn) {
    const run = gate.then(fn, fn);
    gate = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
  return {
    async claim(workerId) {
      return withLock(() => {
        const row = rows.find((r) => r.status === "pending" && r.lockedBy == null);
        if (!row) return null;
        row.lockedBy = workerId;
        row.status = "processing";
        return row.id;
      });
    },
    async finish(id) {
      return withLock(() => {
        const row = rows.find((r) => r.id === id);
        if (!row) return false;
        row.status = "completed";
        row.lockedBy = null;
        return true;
      });
    },
    pending() {
      return rows.filter((r) => r.status === "pending").length;
    },
    processing() {
      return rows.filter((r) => r.status === "processing").length;
    },
    rows,
  };
}

async function drainWave(nClaimers, jobCount) {
  const q = makeQueue(jobCount);
  const claimed = [];
  const latUs = [];
  const workers = Array.from({ length: nClaimers }, async (_, i) => {
    const wid = `w${i}`;
    // each claimer keeps claiming until empty (bounded)
    for (let spin = 0; spin < jobCount + 2; spin += 1) {
      const t0 = performance.now();
      const id = await q.claim(wid);
      latUs.push((performance.now() - t0) * 1000);
      if (!id) break;
      claimed.push(id);
      // simulate tiny work then finish
      await q.finish(id);
    }
  });
  await Promise.all(workers);
  const uniq = new Set(claimed);
  const doubleClaims = claimed.length - uniq.size;
  const sorted = [...latUs].sort((a, b) => a - b);
  const pass = doubleClaims === 0 && uniq.size === Math.min(jobCount, claimed.length) && q.pending() === 0;
  return {
    n: nClaimers,
    jobsSeeded: jobCount,
    claimed: uniq.size,
    attempts: claimed.length,
    doubleClaims,
    pendingLeft: q.pending(),
    p50Us: Math.round(percentile(sorted, 0.5)),
    p95Us: Math.round(percentile(sorted, 0.95)),
    pass,
  };
}

async function main() {
  const waves = [];
  for (const n of LEVELS) {
    // seed enough jobs so concurrency matters
    waves.push(await drainWave(n, n));
  }
  const pass = waves.every((w) => w.pass);
  const out = {
    model: "in-memory SKIP LOCKED claim + finish (throwaway; not Postgres)",
    waves,
    pass,
  };
  if (jsonOnly) {
    console.log(JSON.stringify(out));
    return;
  }
  console.log("Local claim concurrency (throwaway in-memory)");
  for (const w of waves) {
    console.log(
      `  n=${w.n} claimed=${w.claimed}/${w.jobsSeeded} doubles=${w.doubleClaims} p50=${w.p50Us}µs p95=${w.p95Us}µs ${w.pass ? "PASS" : "FAIL"}`,
    );
  }
  console.log(`Overall: ${pass ? "PASS" : "FAIL"}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "local claim failed");
  process.exit(1);
});
