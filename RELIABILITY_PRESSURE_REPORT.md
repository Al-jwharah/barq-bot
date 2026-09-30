# RELIABILITY_PRESSURE_REPORT — Agent 1

**Branch:** `fix/reliability-pressure`  
**When:** 2026-09-22 18:25 Asia/Riyadh (AST, UTC+3)  
**Scope:** Analysis + execution plan only. **No production migration implemented.**  
**Code change:** this document only (zero runtime edits).

---

## 1. Live counts (production)

Queried two independent sources. Numbers match.

### Authenticated `GET https://barq.abdulrhman.ai/api/jobs` (x-barq-job)

```json
{
  "pending": 0,
  "processing": 0,
  "uploading": 0,
  "completed": 15,
  "failed": 16,
  "cancelled": 7,
  "expired": 12,
  "avgSeconds": 16.34,
  "failedToday": 0,
  "oldestProcessingSeconds": 0
}
```

Drain sample (budget default **5**): five `{ "status": "empty" }`.  
Authenticated `POST /api/jobs` empty drain: **HTTP 200**, ~**14604 ms** wall (empty queue reclaim+stats path).

### SQL aggregates (Development `vercel env pull` → mode-600 temp; Production Secret values were `[SENSITIVE]`; `DATABASE_URL` / `BARQ_JOB_SECRET` are linked across Production/Preview/Development — same counts as live API)

| status | count |
| --- | ---: |
| failed | **16** |
| expired | **12** |
| cancelled | **7** |
| completed | **15** |
| pending / processing / uploading | **0** |
| **total rows** | **50** |

Span: oldest job `2026-09-20 23:50 UTC` → newest `2026-09-22 03:00 UTC` (≈ `2026-09-21 02:50` → `2026-09-22 06:00` AST). Created last 24h: **7**. Failed today (`failedToday`): **0**.

---

## 2. Root-cause breakdown of 16 / 12 / 7

These three buckets are **not one failure mode**. Treating “expired” and “cancelled” as reliability incidents overstates pressure.

### 2.1 Failed = 16 (real download failures)

All 16 have `error_code = download_failed`. **0** rows match timeout/stuck (`error_code in (timeout,stuck)` or message ilike timeout/stuck).

| Message (safe) | Count | Mechanism in code |
| --- | ---: | --- |
| `too many redirects` | **5** | `src/lib/media/ssrf.ts` — SSRF redirect cap |
| YouTube Arabic fail (“شورتس أو فيديو أقصر من 12 دقيقة”) | **4** | Product/extract path (yt length / format) |
| `DOWNLOAD_FAILED_SPAWN` | **4** | `spawnYtDlp` `child.on("error")` in `ytdlp.ts` — binary missing / spawn ENOENT / cannot exec `yt-dlp` in isolate |
| File too large (Arabic) | **3** | Telegram cloud size guard |

Attempts: 13× attempts=1, 1× attempts=2, 2× attempts=3 (max 3). Avg run for failed ≈ **22.4 s**. Platform column null on all terminal rows (not stamped before fail).

**Interpretation:** Failures are mostly **content/provider/runtime packaging** (redirect loops, YouTube limits, missing `yt-dlp` binary on serverless, oversize). Not DB queue corruption and not `DOWNLOAD_TIMEOUT` reclaim storms in current data.

### 2.2 Cancelled = 7 (policy / safety — intentional)

| Message | Count |
| --- | ---: |
| Adult/porn text block (Arabic NSFW copy) | **6** |
| Similar +18 copy | **1** |

Code path: `MediaBlockedError` → `finishJob(..., "cancelled")` in `worker.server.ts`. Avg run ≈ **2.6 s**.

**Interpretation:** Not reliability pressure. Safety cancellations working as designed. Do **not** “fix” by re-enabling porn/music filters (owner lock).

### 2.3 Expired = 12 (lifecycle of **successful** jobs)

| Check | Value |
| --- | --- |
| `had_completed_at` | **12 / 12** |
| rows with error text | **0** |
| avg completed→expired | ≈ **88585 s** (~24.6 h) |

Code: `expireCompletedJobs()` in `queue.server.ts` transitions `completed → expired` after **24 hours**. Called from `/api/keep` + cleanup.

**Interpretation:** Expired = retention of past successes, **not** failed downloads. Net successful downloads in this dataset ≈ completed(15) + expired(12) = **27** successes vs **16** hard fails vs **7** policy cancels.

---

## 3. Timeout stack vs Vercel maxDuration (evidence)

| Layer | Configured / observed | Source |
| --- | --- | --- |
| `vercel.json` `maxDuration` | **Absent** (only framework, build, region `fra1`, daily cron `/api/keep`) | `vercel.json` |
| Route `export const maxDuration` on `/api/jobs` | **Absent** | `src/routes/api/jobs.ts` |
| Vercel team hosting `barq-vid` | **Hobby** (`abdulrhmaan999-4640s-projects`) | `vercel teams ls` |
| Fluid Compute Hobby default / max | **300 s / 300 s** (docs Sep 2026) | Vercel Fluid docs |
| `jobTimeoutMs()` / `DOWNLOAD_TIMEOUT_MS` default | **900000 ms (15 min)** | `job-status.ts`, `config.server.ts` |
| Env `DOWNLOAD_TIMEOUT_MS` in Vercel | **Not set** (prod/dev pull) | `vercel env ls` / pull |
| `YTDLP_TIMEOUT_MS` | **28000** hardcoded | `ytdlp.ts` |
| `runDownloader` spawn timeout fallback | **55000** via `downloadTimeoutMs` | `ytdlp.ts` |
| `/api/keep` drain race timeout | **28000** (`KEEP_DRAIN_TIMEOUT_MS`) | `keep.ts` |
| `/api/jobs` drain budget | default **5** (`JOBS_DRAIN_BUDGET` unset) | `jobs.ts` |
| `MAX_CONCURRENT_JOBS` | unset → code default **3** | env + `worker.server.ts` |
| Stale comment in `ytdlp.ts` | still says Hobby **10s** / Pro 60–300 | outdated vs Fluid 300s |

### Mismatch that matters

1. **App stuck-reclaim window = 15 min** (`reclaimStuckJobs` uses `jobTimeoutMs()`), while **platform can kill the isolate at ≤300 s** on Hobby. A serverless kill can leave `processing`/`uploading` rows until heartbeat is older than **15 minutes** before reclaim. Idle queue today (`processing=0`) hides this; under load it creates false “stuck” latency.
2. **Outer job deadline 15 min ≫ platform 5 min** — `withDeadline(..., jobTimeoutMs())` never fires first on Hobby; Vercel kills first.
3. **Practical download caps are 28–55 s** (yt-dlp / keep), which aligns with observed avg complete ≈ **16–20 s** and failed ≈ **22 s** — not the 15-minute constant.
4. **Hobby cron** remains daily-only (`0 4 * * *`). Deep queue relies on webhook + `/api/jobs` self-kick (depth ≤ 1). Load harness (same day) showed parallel kicks still stress Neon pool (×10 → 503).

**Suggested env (owner approval only — not applied):**

- `DOWNLOAD_TIMEOUT_MS=280000` (or ≤ `270000`) so reclaim ≤ Fluid Hobby max with headroom  
- Optionally set `JOBS_DRAIN_BUDGET=2` under pool storms (already documented in load report; code default is now 5)  
- Optionally document `maxDuration` in `vercel.json` for `__server` / Fluid once owner confirms Fluid is on for the project  

Do **not** raise `DOWNLOAD_TIMEOUT_MS` toward 900000 on Hobby — it widens stuck reclaim lag without buying runtime.

---

## 4. Architecture pressure (beyond the 16/12/7 labels)

From code + prior live harness (`LOAD_TEST_LIVE_REPORT.md`) + this probe:

- Executor is **Vercel serverless** (`waitUntil` + `/api/jobs` + daily `/api/keep`). Comments in `worker.server.ts` state a dedicated worker is **not** deployed.
- Postgres queue with `FOR UPDATE SKIP LOCKED` is sound (local claim sim PASS at 50).
- Parallel drain kicks still overload DB pool (historical ×25/×50 HTTP 500; post-mitigation ×10 still 503). Soft criteria for viral launch **not** met.
- `DOWNLOAD_FAILED_SPAWN` (4/16 fails) is a strong signal that **yt-dlp is not a reliable citizen inside the Vercel isolate** (missing binary or spawn failure). Long downloads / binary tooling belong on an always-on host.
- No Redis / BullMQ dependency exists today (`package.json`: `@vercel/functions`, `pg`, no bull/ioredis).

---

## 5. Option evaluation

### Option A — Redis-backed queue (BullMQ / Upstash Redis)

| Pros | Cons |
| --- | --- |
| Familiar retry/backoff/dashboard; delayed jobs; rate limiters | **Does not replace the executor** — someone must still run workers with `yt-dlp`/ffmpeg |
| Offloads claim storms from Neon if workers are separate | Adds Redis cost + ops; migration of `download_jobs` semantics (job_key uniqueness, Telegram update_id, quota) |
| Good if many short jobs / multi-service producers | Current Postgres SKIP LOCKED already provides durable queue; Redis alone won’t fix SPAWN or Kick-storm CPU |

**Evidence fit:** Current failures are mostly extract/spawn/policy, not “lost messages.” Kick-storm is connection/concurrency, not lack of Redis.  
**Verdict:** Useful **as a later complement** after (or with) an always-on worker; **insufficient alone**. Risk if done first: dual-write complexity without solving binary/runtime.

### Option B — Always-on worker outside Vercel (Fly / Railway / small VM)

| Pros | Cons |
| --- | --- |
| Matches code comments + `PRODUCTION.md` red item | New host, secrets, deploy pipeline, health checks |
| Can install `yt-dlp` + ffmpeg; run past 300s if needed | Must change kick URL / stop relying on serverless drain for heavy work |
| Single consumer loop → no Hobby cron limit; controlled concurrency vs Neon pool | Owner must approve infra + env; not a drive-by on this branch |
| Directly addresses SPAWN, long YouTube, and kick-storm | Slightly higher fixed cost than pure serverless |

**Evidence fit:** Best match to (1) SPAWN failures, (2) documented launch blocker, (3) load-test conclusion, (4) timeout mismatch. Keep Vercel for webhook/UI; worker claims `download_jobs` (or BullMQ later).  
**Verdict:** **Recommended primary path.** Redis (A) optional phase-2 for multi-worker scale.

### Hybrid (recommended sequence)

1. Ship always-on worker claiming existing Postgres queue (minimal schema change).  
2. Point `kickJobWorker` / internal origin at worker wake endpoint (or worker polls).  
3. Cap Vercel `/api/jobs` to reclaim + light drain only (or stats-only).  
4. Revisit BullMQ only if multi-region workers or very high enqueue rate needs it.

---

## 6. Execution plan (WAIT for owner decision)

**Do not implement until owner picks A / B / hybrid / defer.**

### Phase 0 — owner decisions (no code)

- [ ] Choose **B** (worker) vs **A** (Redis) vs **hybrid** vs **defer** (soft beta only).  
- [ ] Approve suggested env: `DOWNLOAD_TIMEOUT_MS` ≤ 270000; confirm Fluid on project; optionally explicit `maxDuration`.  
- [ ] Pick host: Fly.io vs Railway vs existing VM; region near `fra1` / DB.  
- [ ] Confirm yt-dlp+ffmpeg license/compliance on that host.

### Phase 1 — if B or hybrid (approx 1–3 days eng)

1. Docker image: Node app worker entry (`drainJobs` loop / `claimNextJob`) + yt-dlp + ffmpeg.  
2. Secrets: `DATABASE_URL`, `BARQ_JOB_SECRET`, Telegram, Blob — **owner sets on host** (agents must not create/modify Vercel secrets).  
3. Health: `/healthz` + metrics: claimed/min, spawn errors, pool waits.  
4. Cutover: feature-flag `BARQ_EXTERNAL_WORKER=on`; Vercel kicks become no-op or stats-only; webhook still enqueues.  
5. Prove: enqueue 20 URLs; 0 SPAWN; pending drains without `/api/jobs` storm; Neon connections stable under 10 parallel webhooks.

### Phase 2 — only if A added

1. Upstash Redis + BullMQ worker on same always-on host.  
2. Dual-write or migrate enqueue; keep `download_jobs` as source of truth for admin UI until cutover.  
3. Load test claim 50 + Telegram soft beta.

### Phase 3 — observability

- Alert: `failed` with `DOWNLOAD_FAILED_SPAWN` > 0 in 1h; `pending >= 5`; oldest processing > reclaim window.  
- Dashboard already has `jobStats`; extend error_code breakdown (spawn/redirect/too_large).

### Explicit non-goals this branch

- No push to `main`.  
- No download path (fx/syndication/GraphQL/vx/twimg) edits.  
- No Vercel env mutations.  
- No full production migration in this pass.

---

## 7. Risk estimate

| Path | Reliability gain | Eng risk | Ops / cost risk | Launch readiness |
| --- | --- | --- | --- | --- |
| Do nothing | Low — soft beta OK while traffic tiny (50 jobs total) | None | Kick-storm + SPAWN remain | **Blocked for viral** (matches PRODUCTION.md) |
| Env-only timeout align | Medium for stuck reclaim; **no** SPAWN fix | Low | Low | Partial |
| **A Redis only** | Low–medium | Medium (dual queue) | Medium | Still blocked without worker binaries |
| **B always-on worker** | **High** | Medium | Medium (host) | Unlocks viral path |
| Hybrid B→A | Highest at scale | Higher | Higher | Best long-term |

**Overall:** Current 16/12/7 is **misread as a single outage**. True launch risk is **serverless executor + pool kick-storm + yt-dlp spawn**, not expiry/cancel volumes.

---

## 8. How this was tested / investigated

1. `git` on `fix/reliability-pressure` (clean).  
2. Read `vercel.json`, `jobs.ts`, `keep.ts`, `queue.server.ts`, `worker.server.ts`, `job-status.ts`, `ytdlp.ts`, `PRODUCTION.md`, `LOAD_TEST_LIVE_REPORT.md`, `RUNBOOK.md`.  
3. `vercel env pull` production → secrets masked; development pull → mode-600 temp; **never printed secrets**.  
4. SQL aggregates via `pg` one-off (status counts, error messages, expired shape, attempts).  
5. Live authenticated GET+POST `/api/jobs` against `https://barq.abdulrhman.ai`.  
6. `vercel teams ls` → Hobby; `vercel env ls production` → timeout envs absent.  
7. Cross-check Vercel Fluid Hobby maxDuration docs (300s).

---

## 9. Side effects of this agent pass

- Added **`RELIABILITY_PRESSURE_REPORT.md`** on `fix/reliability-pressure` only.  
- **No** application code changes.  
- **No** Vercel env create/modify/delete.  
- Temp env files under `/tmp/barq-agent1/` (mode 600); should be shredded after owner review.  
- Temporary aggregate scripts removed from `scripts/` (not committed).

---

## 10. Owner ask

**Please choose:**  
**(B) always-on worker**, **(A) Redis/BullMQ**, **hybrid (B then A)**, or **defer** with soft-beta limits only.

Until then: no migration work from Agent 1.
