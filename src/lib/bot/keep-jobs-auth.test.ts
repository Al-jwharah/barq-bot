import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("GET/POST /api/keep require job auth before drain or health dump", () => {
  const src = readFileSync("src/routes/api/keep.ts", "utf8");
  assert.match(src, /authorizeJobRequest/);
  assert.match(src, /publicOk|ok:\s*true/);
  assert.match(src, /status:\s*401/);
  assert.match(src, /if\s*\(\s*!authed\s*\)\s*return\s+publicOk\(\)/);
  assert.match(src, /if\s*\(\s*!authorizeJobRequest\(request,\s*bodySecret\)\s*\)/);
  assert.ok(src.indexOf("if (!authed) return publicOk()") < src.indexOf("return Response.json(await tick())"));
});

test("GET /api/jobs does not leak queue stats without auth", () => {
  const src = readFileSync("src/routes/api/jobs.ts", "utf8");
  assert.match(src, /authorizeJobRequest/);
  assert.match(src, /if\s*\(\s*!authorizeJobRequest\(request\)\s*\)/);
  assert.doesNotMatch(
    src,
    /if\s*\(\s*!authorizeJobRequest\(request\)\s*\)\s*return\s+Response\.json\(\{\s*ok:\s*true,\s*queue:/,
  );
});

test("GET/POST /api/jobs self-kick stops when pending is 0 and caps kick depth", () => {
  const src = readFileSync("src/routes/api/jobs.ts", "utf8");
  assert.match(src, /selfKickIfPending/);
  assert.match(src, /if\s*\(\s*!\(pending\s*>\s*0\)\s*\)\s*return/);
  assert.match(src, /MAX_SELF_KICK_DEPTH\s*=\s*1/);
  assert.match(src, /x-barq-kick-depth/);
  assert.match(src, /depth\s*>=\s*MAX_SELF_KICK_DEPTH/);
  assert.match(src, /jobsDrainBudget|JOBS_DRAIN_BUDGET/);
  assert.match(src, /return 5/);
  assert.match(src, /SELF_KICK_BASE_DELAY_MS\s*=\s*120/);
  assert.match(src, /SELF_KICK_JITTER_MS\s*=\s*80/);
  assert.match(src, /isDbOverloadError/);
  assert.match(src, /status:\s*503/);
  assert.match(src, /Retry-After/);
  // Root kicks reclaim; self-kicks (depth>0) drain only
  assert.match(src, /if\s*\(\s*depth\s*===\s*0\s*\)/);
  assert.match(src, /reclaimThenDrain\(JOBS_DRAIN_BUDGET,\s*depth\)/);
});

test("GET /api/keep drain budget raised carefully to 8 with timeout", () => {
  const src = readFileSync("src/routes/api/keep.ts", "utf8");
  assert.match(src, /KEEP_DRAIN_BUDGET\s*=\s*8/);
  assert.match(src, /KEEP_DRAIN_TIMEOUT_MS\s*=\s*28_000/);
  assert.match(src, /drainJobs\(KEEP_DRAIN_BUDGET\)/);
});
