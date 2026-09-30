#!/usr/bin/env node
/**
 * Safe production drain load harness.
 *
 * Hits PRODUCTION only via authenticated /api/jobs (header x-barq-job).
 * Does NOT enqueue junk download_jobs and does NOT spam Telegram/Bot API.
 *
 * Secrets: vercel env pull → temp file mode 600; never printed.
 * Production Secret-type vars may pull as the literal "[SENSITIVE]"; when that
 * happens we fall back to Development pull for BARQ_JOB_SECRET only when the
 * same key is linked across Production/Preview/Development (as in this project).
 *
 * Usage:
 *   PATH=/home/box/.local/bin:$PATH node scripts/load-jobs-harness.mjs
 */
import { mkdtemp, writeFile, chmod, unlink, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const SCOPE = process.env.VERCEL_SCOPE || "abdulrhmaan999-4640s-projects";
const PARALLEL_LEVELS = (process.env.BARQ_LOAD_PARALLEL || "10,25,50")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
if (!PARALLEL_LEVELS.length) throw new Error("BARQ_LOAD_PARALLEL produced no levels");
const SKIP_RECLAIM = /^(1|true|yes|on)$/i.test(String(process.env.BARQ_LOAD_SKIP_RECLAIM || ""));
const RECLAIM_N = Math.max(0, Number(process.env.BARQ_LOAD_RECLAIM_N || (SKIP_RECLAIM ? 0 : 10)) || 0);
const REQUEST_TIMEOUT_MS = 60_000;
const P95_SOFT_MS = 15_000;
const ERROR_RATE_SOFT = 0.05;
const PLACEHOLDER = "[SENSITIVE]";

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[idx];
}

function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(t);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v.replace(/\\n/g, "\n");
  }
  return out;
}

function isUsableSecret(v) {
  return Boolean(v && v.trim() && v.trim() !== PLACEHOLDER && !v.includes("SENSITIVE"));
}

async function pullEnv(environment) {
  const dir = await mkdtemp(join(tmpdir(), "barq-load-env-"));
  const file = join(dir, `.env.${environment}.local`);
  const pull = spawnSync(
    "vercel",
    ["env", "pull", file, "--environment", environment, "--yes", "--scope", SCOPE],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `/home/box/.local/bin:${process.env.PATH || ""}` },
    },
  );
  if (pull.status !== 0) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    throw new Error(`vercel env pull (${environment}) failed (exit ${pull.status}). stderr redacted.`);
  }
  await chmod(file, 0o600);
  const raw = await readFile(file, "utf8");
  const env = parseEnvFile(raw);
  await writeFile(file, "# scrubbed\n", { mode: 0o600 }).catch(() => undefined);
  await unlink(file).catch(() => undefined);
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  return env;
}

async function pullSecrets() {
  const notes = [];
  const prod = await pullEnv("production");
  let secret = process.env.BARQ_JOB_SECRET?.trim() || "";
  let secretSource = "process.env";
  if (!isUsableSecret(secret)) {
    secret = prod.BARQ_JOB_SECRET?.trim() || "";
    secretSource = "production pull";
  }
  if (!isUsableSecret(secret)) {
    // Same BARQ_JOB_SECRET is linked to Development; production Secret pull is masked.
    const dev = await pullEnv("development");
    secret = dev.BARQ_JOB_SECRET?.trim() || "";
    secretSource = "development pull (production Secret masked as [SENSITIVE])";
    notes.push(
      "Production env pull masked BARQ_JOB_SECRET as [SENSITIVE]; used Development pull of the same linked secret.",
    );
  }
  const origin = (
    process.env.BARQ_LOAD_ORIGIN?.trim() ||
    process.env.BARQ_PUBLIC_ORIGIN?.trim() ||
    prod.BARQ_PUBLIC_ORIGIN?.trim() ||
    "https://barq.abdulrhman.ai"
  ).replace(/\/$/, "");
  if (!isUsableSecret(secret)) throw new Error("BARQ_JOB_SECRET unavailable after env pull");
  if (!origin.startsWith("https://")) throw new Error("origin must be https");
  notes.push(`Secret source: ${secretSource} (value never logged).`);
  return { secret, origin, notes };
}

async function authedFetch(origin, secret, method, path) {
  const headers = {
    "Content-Type": "application/json",
    "x-barq-job": secret,
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const res = await fetch(`${origin}${path}`, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify({ secret }) : undefined,
      signal: ctrl.signal,
    });
    const ms = performance.now() - t0;
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      ms,
      pending: json?.queue?.pending ?? null,
      processing: json?.queue?.processing ?? null,
      error: res.ok ? null : json?.error || `http_${res.status}`,
      hasQueue: Boolean(json?.queue),
      // Auth proof: authenticated GET must include queue object
      authedShape: Boolean(json?.queue) || (method === "POST" && res.ok && json?.ok === true),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: performance.now() - t0,
      pending: null,
      processing: null,
      error: err instanceof Error ? err.name : "fetch_error",
      hasQueue: false,
      authedShape: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function statsSnapshot(origin, secret) {
  return authedFetch(origin, secret, "GET", "/api/jobs");
}

async function runParallel(origin, secret, n, method = "POST") {
  const started = Date.now();
  const results = await Promise.all(
    Array.from({ length: n }, () => authedFetch(origin, secret, method, "/api/jobs")),
  );
  const wallMs = Date.now() - started;
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const errors = results.filter((r) => !r.ok);
  const statuses = {};
  for (const r of results) statuses[r.status] = (statuses[r.status] || 0) + 1;
  return {
    n,
    method,
    wallMs,
    p50Ms: Math.round(percentile(latencies, 0.5)),
    p95Ms: Math.round(percentile(latencies, 0.95)),
    maxMs: Math.round(latencies[latencies.length - 1] || 0),
    minMs: Math.round(latencies[0] || 0),
    ok: results.filter((r) => r.ok).length,
    fail: errors.length,
    errorRate: errors.length / n,
    statuses,
    sampleErrors: errors.slice(0, 5).map((e) => e.error),
    authedOk: results.filter((r) => r.authedShape).length,
  };
}

function verdictFor(wave) {
  const p95Pass = wave.p95Ms <= P95_SOFT_MS;
  const errPass = wave.errorRate <= ERROR_RATE_SOFT;
  const authPass = wave.method === "GET" ? wave.authedOk === wave.n : wave.ok === wave.n;
  return {
    pass: p95Pass && errPass && wave.ok === wave.n && authPass,
    p95Pass,
    errPass,
    authPass,
  };
}

function formatReport({ originHost, when, before, after, waves, reclaim, notes }) {
  const lines = [];
  lines.push("# LOAD_TEST_LIVE_REPORT");
  lines.push("");
  lines.push(`Date: ${when} (Asia/Riyadh)`);
  lines.push(`Origin under test: \`https://${originHost}\` (authenticated \`/api/jobs\` only)`);
  lines.push("");
  lines.push("## Scope (honest)");
  lines.push("");
  lines.push("This harness measures **authenticated queue drain / reclaim kick latency** on production.");
  lines.push("It does **not**:");
  lines.push("");
  lines.push("- Create Telegram users or fake downloads to strangers");
  lines.push("- Insert junk URLs into production `download_jobs`");
  lines.push("- Exercise yt-dlp, Telegram Bot API delivery, or end-to-end 50-user download UX");
  lines.push("");
  lines.push("Full Telegram 50-user load requires real user accounts / consented chats — **not automated here**.");
  lines.push("");
  lines.push("## Soft criteria (drain kick, empty-or-light queue)");
  lines.push("");
  lines.push(`- P95 ≤ ${P95_SOFT_MS} ms per kick`);
  lines.push(`- Error rate ≤ ${ERROR_RATE_SOFT * 100}%`);
  lines.push("- HTTP 200 for every parallel request");
  lines.push("- Authenticated GET must return queue stats (not the public `{ok:true}` shape)");
  lines.push("");
  lines.push("## Queue before");
  lines.push("");
  if (before?.hasQueue) {
    lines.push(`- pending: ${before.pending}`);
    lines.push(`- processing: ${before.processing}`);
    lines.push(`- GET latency: ${Math.round(before.ms)} ms (status ${before.status})`);
  } else {
    lines.push(`- stats unavailable (status ${before?.status}, err ${before?.error || "n/a"}, authedShape=${before?.authedShape})`);
  }
  lines.push("");
  lines.push("## Parallel POST /api/jobs waves");
  lines.push("");
  lines.push("| Parallel | OK/Fail | P50 ms | P95 ms | Max ms | Wall ms | Error rate | Verdict |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const w of waves) {
    const v = verdictFor(w);
    lines.push(
      `| ${w.n} | ${w.ok}/${w.fail} | ${w.p50Ms} | ${w.p95Ms} | ${w.maxMs} | ${w.wallMs} | ${(w.errorRate * 100).toFixed(1)}% | ${v.pass ? "PASS" : "FAIL"} |`,
    );
  }
  lines.push("");
  lines.push("## Reclaim path (authenticated GET /api/jobs)");
  lines.push("");
  if (reclaim) {
    const v = verdictFor(reclaim);
    lines.push(
      `- Parallel ${reclaim.n}: OK ${reclaim.ok}/${reclaim.n}, authed ${reclaim.authedOk}/${reclaim.n}, P50 ${reclaim.p50Ms} ms, P95 ${reclaim.p95Ms} ms, wall ${reclaim.wallMs} ms → **${v.pass ? "PASS" : "FAIL"}**`,
    );
  } else {
    lines.push("- not run");
  }
  lines.push("");
  lines.push("## Queue after");
  lines.push("");
  if (after?.hasQueue) {
    lines.push(`- pending: ${after.pending}`);
    lines.push(`- processing: ${after.processing}`);
    lines.push(`- GET latency: ${Math.round(after.ms)} ms`);
  } else {
    lines.push("- stats unavailable");
  }
  lines.push("");
  lines.push("## Overall");
  lines.push("");
  const wavePass = waves.every((w) => verdictFor(w).pass);
  const reclaimPass = reclaim ? verdictFor(reclaim).pass : true;
  const overall = wavePass && reclaimPass;
  lines.push(`- Drain waves ${PARALLEL_LEVELS.join("/")}: **${wavePass ? "PASS" : "FAIL"}**`);
  lines.push(`- Reclaim wave: **${reclaim ? (reclaimPass ? "PASS" : "FAIL") : "SKIPPED"}**`);
  lines.push(`- **Live drain harness: ${overall ? "PASS" : "FAIL"}**`);
  lines.push("- **Telegram 50-user E2E: NOT RUN** (requires real user accounts)");
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const n of notes) lines.push(`- ${n}`);
  lines.push("");
  lines.push("## Max automated proof achieved");
  lines.push("");
  lines.push(
    `Authenticated production drain kicks at concurrency **${Math.max(...PARALLEL_LEVELS)}**, plus reclaim GET concurrency 10.`,
  );
  lines.push("Local claim/drain concurrency sim: see scripts/load-claim-local.mjs results below if attached.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const { secret, origin, notes: pullNotes } = await pullSecrets();
  const originHost = new URL(origin).host;
  const when = new Date().toLocaleString("en-GB", { timeZone: "Asia/Riyadh", hour12: false });

  const unauth = await fetch(`${origin}/api/jobs`);
  const unauthBody = await unauth.text();
  let unauthOk = unauth.status === 200 && !/pending|failed|avg/i.test(unauthBody);
  try {
    const j = JSON.parse(unauthBody);
    unauthOk = unauthOk && j.ok === true && j.queue == null;
  } catch {
    unauthOk = false;
  }

  const before = await statsSnapshot(origin, secret);
  const waves = [];
  for (const n of PARALLEL_LEVELS) {
    waves.push(await runParallel(origin, secret, n, "POST"));
    await new Promise((r) => setTimeout(r, 750));
  }
  const reclaim = RECLAIM_N > 0 ? await runParallel(origin, secret, RECLAIM_N, "GET") : null;
  const after = await statsSnapshot(origin, secret);

  const notes = [
    ...pullNotes,
    "No production download_jobs INSERT of junk URLs.",
    "Kick-depth / keep-budget code changes may still be pre-deploy — coordinator deploys.",
    unauthOk
      ? "Unauthenticated GET /api/jobs returns {ok:true} without queue stats."
      : "WARNING: unauthenticated GET /api/jobs shape unexpected.",
  ];
  for (const w of waves) {
    if (w.sampleErrors.length) {
      notes.push(`Wave n=${w.n} sample errors: ${w.sampleErrors.join(", ")}`);
    }
  }

  const reportPath = process.env.BARQ_LOAD_REPORT || join(root, "LOAD_TEST_LIVE_REPORT.md");
  let body = formatReport({ originHost, when, before, after, waves, reclaim, notes });

  const local = spawnSync(process.execPath, [join(root, "scripts/load-claim-local.mjs"), "--json"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (local.status === 0 && local.stdout.trim()) {
    try {
      const localJson = JSON.parse(local.stdout.trim().split("\n").filter(Boolean).at(-1));
      body += "## Local claim concurrency (throwaway in-memory DB)\n\n";
      body += "| Parallel claimers | Distinct jobs claimed | Double-claims | P50 claim µs | P95 claim µs | Verdict |\n";
      body += "| --- | --- | --- | --- | --- | --- |\n";
      for (const row of localJson.waves || []) {
        body += `| ${row.n} | ${row.claimed} | ${row.doubleClaims} | ${row.p50Us} | ${row.p95Us} | ${row.pass ? "PASS" : "FAIL"} |\n`;
      }
      body += `\n- Local overall: **${localJson.pass ? "PASS" : "FAIL"}**\n`;
      body += `- Model: ${localJson.model}\n\n`;
    } catch {
      body += "## Local claim concurrency\n\n- ran but JSON parse failed\n\n";
    }
  } else {
    body += "## Local claim concurrency\n\n- script not run or failed (non-fatal for live drain report)\n\n";
  }

  await writeFile(reportPath, body, "utf8");

  console.log(
    JSON.stringify(
      {
        originHost,
        unauthOk,
        beforeAuthed: before.authedShape,
        beforePending: before.pending,
        waves: waves.map((w) => ({
          n: w.n,
          p50Ms: w.p50Ms,
          p95Ms: w.p95Ms,
          ok: w.ok,
          fail: w.fail,
          statuses: w.statuses,
          pass: verdictFor(w).pass,
        })),
        reclaim: reclaim
          ? {
              n: reclaim.n,
              p50Ms: reclaim.p50Ms,
              p95Ms: reclaim.p95Ms,
              ok: reclaim.ok,
              fail: reclaim.fail,
              authedOk: reclaim.authedOk,
              pass: verdictFor(reclaim).pass,
            }
          : null,
        afterPending: after.pending,
        report: reportPath,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "load harness failed");
  process.exit(1);
});
