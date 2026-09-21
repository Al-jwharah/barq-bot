# LOAD_TEST_REPORT

Date: 2026-09-21  
**Verdict: cannot pass public-launch load criteria.**

There is no real 10 / 25 / 50 concurrent-user load test against production, Telegram, the queue worker, or Postgres.

## Scope

In-process simulation of `job_key` uniqueness and hashing latency only.

This harness did **not** talk to Telegram, did **not** open a database, did **not** enqueue real download jobs, and did **not** hit a live origin.

See `src/lib/jobs/load-sim.test.ts`.

## What was run (simulated only)

| Scenario | Result | Label |
| --- | --- | --- |
| 10 concurrent `makeJobKey` calls, same user + same URL | One key (collision as designed) | simulated only |
| Same user, different URLs | Distinct keys | simulated only |
| 25 unique user+URL pairs | 25 distinct keys | simulated only |
| 50 unique user+URL pairs | 50 distinct keys | simulated only |
| 10 mixed workers (10 collisions + 15 distinct) | 16 unique keys | simulated only |
| In-process mint timings for n=10/25/50 | Sample p50/p95 of `makeJobKey` wall time on this CPU | **simulated only** |

The timing helper records `performance.now()` around a local hash. Those numbers are CPU hashing latency, not request P95, not queue wait, not Telegram upload. **They are not written here as production P95 and must not be cited as capacity proof.**

## What was **not** run

Real load with **10 / 25 / 50 concurrent production users was NOT run.**

Not covered:

- Telegram Bot API / webhook / polling
- Queue worker throughput (`/api/jobs` on the same serverless runtime, `waitUntil`)
- Postgres / PGlite contention
- Rate limits, daily cap, join-gate, paywall
- Upload to Telegram, blob storage, yt-dlp
- End-to-end latency or error rates under concurrent users
- Restore under load

No production P95, error rate, or saturation point exists for this product.

## Verdict

**Cannot pass public-launch load criteria.**

A unit simulation of `job_key` minting is not a load test. Public launch still needs a real 10/25/50-user Telegram run against the live queue, worker, and network path, with measured P95 and error rate. Until that exists, do not claim the bot was load-tested.
