# Restore proof — برق ⚡️

**Verdict: PROVEN (second live database)**  
**Date (Asia/Riyadh):** 2026-09-22 04:29 +03  
**Date (UTC):** 2026-09-22T01:29:58Z  
**Automated mode:** `restore-database-url` (Docker Postgres throwaway)  
**Result:** PASS

## Coverage (code)

Upsert restore (no table truncate) includes:

| Bucket | Backup dump | Restore upsert |
|--------|-------------|----------------|
| bot_settings | yes | yes |
| members | yes (all rows) | yes |
| promo_codes | yes | **yes (was missing before)** |
| usage_counters | yes | yes |
| bans | **yes (new)** | **yes (new)** |
| support_tickets | **yes (new)** | **yes (new)** |
| clip_links metadata | **yes (new)** | **yes (new)** — blob bytes not copied |
| download_jobs metadata | **yes (new, cap 5000)** | **yes (new)** — active statuses coerced to `cancelled` |

## What was proven (second DB)

1. Started a **temporary** Postgres 16 container named `barq-restore-proof-pg` (bound to `127.0.0.1:55432` only).
2. Set `RESTORE_DATABASE_URL` to that database only. `DATABASE_URL` / `POSTGRES_URL` were **unset** for the run (script also refuses when restore URL normalizes equal to production).
3. Built a fixture snapshot matching `scripts/restore-dry-run.mjs` `fixtureSnapshot()` (same shape as `GET /api/backup` buckets) at `/tmp/barq-restore-proof/snapshot.json` (not committed).
4. Ran:
   ```bash
   export PATH=/home/box/.local/bin:$PATH
   export DOCKER_HOST=tcp://127.0.0.1:2375
   unset DATABASE_URL POSTGRES_URL
   export RESTORE_DATABASE_URL="$(cat /tmp/barq-restore-proof/RESTORE_DATABASE_URL)"  # temp DB only
   npm run restore:dry-run -- --snapshot /tmp/barq-restore-proof/snapshot.json
   ```
5. Script output (counts only):  
   `second-db restore ok {"settings":2,"codes":1,"members":1,"usage":1,"bans":1,"tickets":1,"clips":1,"jobs":2}`  
   Migrated 23 pending migration file(s) onto the second DB before upsert.
6. Verified live row counts on the **second** DB via `docker exec … psql` (no connection strings logged):

| Table | Expected from snapshot | Observed |
|-------|------------------------|----------|
| members | 1 | **1** |
| promo_codes | 1 | **1** |
| bans | 1 | **1** |
| support_tickets | 1 | **1** |
| clip_links | 1 | **1** |
| download_jobs | 2 | **2** |
| usage_counters | 1 | **1** |
| bot_settings | ≥2 upserted | **17** (migrations seed defaults + 2 fixture upserts) |

7. Job coercion check:
   - `job-dry-1` was `pending` in snapshot → restored as `cancelled` with `error_code=restored_from_backup`
   - `job-dry-2` was `completed` → stayed `completed`

## Commands used (no secrets)

```bash
# Docker CLI (engine already listening on 127.0.0.1:2375)
export PATH=/home/box/.local/bin:$PATH
export DOCKER_HOST=tcp://127.0.0.1:2375

docker run -d --name barq-restore-proof-pg \
  -e POSTGRES_USER=barq_proof \
  -e POSTGRES_PASSWORD='…local-only…' \
  -e POSTGRES_DB=barq_restore_proof \
  -p 127.0.0.1:55432:5432 \
  postgres:16-alpine

# Wait until ready
docker exec barq-restore-proof-pg pg_isready -U barq_proof -d barq_restore_proof

# Restore (RESTORE_DATABASE_URL must NOT equal production DATABASE_URL)
unset DATABASE_URL POSTGRES_URL
export RESTORE_DATABASE_URL='postgresql://barq_proof:***@127.0.0.1:55432/barq_restore_proof'
npm run restore:dry-run -- --snapshot /tmp/barq-restore-proof/snapshot.json

# Verify counts
docker exec barq-restore-proof-pg psql -U barq_proof -d barq_restore_proof -c "
SELECT 'members' AS t, count(*) FROM members
UNION ALL SELECT 'promo_codes', count(*) FROM promo_codes
UNION ALL SELECT 'bans', count(*) FROM bans
UNION ALL SELECT 'support_tickets', count(*) FROM support_tickets
UNION ALL SELECT 'clip_links', count(*) FROM clip_links
UNION ALL SELECT 'download_jobs', count(*) FROM download_jobs
UNION ALL SELECT 'usage_counters', count(*) FROM usage_counters
UNION ALL SELECT 'bot_settings', count(*) FROM bot_settings;
"
```

## Safety locks honored

- Production `DATABASE_URL` was **never** used as the restore target.
- `RESTORE_DATABASE_URL` pointed only at `127.0.0.1:55432/barq_restore_proof`.
- Script refuses when restore URL normalizes equal to `DATABASE_URL`.
- Snapshot JSON and connection strings stay off git and out of this report.
- No chat-filter / content-filter re-enable performed.

## Cleanup

Temp container was torn down after this proof (see `RESTORE_TEST_REPORT.md`). To clean manually if anything remains:

```bash
export DOCKER_HOST=tcp://127.0.0.1:2375
docker rm -f barq-restore-proof-pg
rm -rf /tmp/barq-restore-proof
```

## Scope note

This proves **fixture snapshot → migrate + upsert → second live Postgres** end-to-end, including promo_codes / bans / tickets / clips / jobs metadata and active-job coercion. A production `GET /api/backup` dump restored into a clone remains an optional owner drill (same commands with a real snapshot file); it was not required to mark second-DB path PROVEN once the live second Postgres path passed.
