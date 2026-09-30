# Restore test report — برق ⚡️

**Verdict: PROVEN** (second live Postgres restore succeeded)

Date: 2026-09-22 04:29 +03 (Asia/Riyadh)  
UTC: 2026-09-22T01:29:58Z

## What exists

- `GET /api/backup` dumps a JSON snapshot after owner/admin auth (`owners.manage` / `barq_admin` cookie).
- Snapshot buckets: **settings, codes (promo_codes), members (all rows), usage, bans, support_tickets, clip_links metadata, download_jobs metadata (cap 5000)**.
- `POST /api/backup` requires an admin session.
  - `{ "confirm": "TEST", "snapshot": … }` → `restoreTest()` — shape check only, **no writes**.
  - `{ "confirm": "RESTORE", "snapshot": … }` → `restoreBackup()` — **upsert** into the **current** app DB (no truncate).
- Restore upserts **promo_codes**, bans, tickets, clip metadata, job metadata.
- Active job statuses (`pending` / `processing` / `uploading`) coerce to `cancelled` with `error_code=restored_from_backup`.
- Clip restore is metadata-only (blob bytes not copied).
- `scripts/restore-dry-run.mjs` (`npm run restore:dry-run`):
  - Refuses when `RESTORE_DATABASE_URL` equals `DATABASE_URL`.
  - If `RESTORE_DATABASE_URL` is a **different** URL: migrate + upsert there.
  - If unset: temporary PGLite fixture path (shape / local only).

Logs record counts / mode only. Snapshot JSON is not logged. This report does not print `DATABASE_URL`, `RESTORE_DATABASE_URL`, passwords, or snapshot payloads.

## Coverage: before vs after

| Bucket | Before dump | Before restore | After dump | After restore |
|--------|-------------|----------------|------------|---------------|
| settings | yes | yes | yes | yes |
| members | yes (limit 500) | yes | yes (all) | yes |
| promo_codes | yes | **no** | yes | **yes** |
| usage | yes | yes | yes | yes |
| bans | no | no | **yes** | **yes** |
| support_tickets | no | no | **yes** | **yes** |
| clip_links | no | no | **yes (meta)** | **yes (meta)** |
| download_jobs | no | no | **yes (meta)** | **yes (coerced)** |

## Second-DB proof (executed)

| Step | Detail | Result |
|------|--------|--------|
| Temp Postgres | Docker `postgres:16-alpine` container `barq-restore-proof-pg` on `127.0.0.1:55432` | PASS |
| Target URL | `RESTORE_DATABASE_URL` → temp DB only; `DATABASE_URL` unset | PASS |
| Snapshot | Fixture matching backup bucket shape (`--snapshot /tmp/barq-restore-proof/snapshot.json`) | PASS |
| Restore | `npm run restore:dry-run -- --snapshot …` | PASS — written `{settings:2,codes:1,members:1,usage:1,bans:1,tickets:1,clips:1,jobs:2}` |
| Migrations | 23 pending files applied on second DB | PASS |
| Row counts | members=1, promo_codes=1, bans=1, support_tickets=1, clip_links=1, download_jobs=2, usage_counters=1; bot_settings=17 (seeded + upserts) | PASS |
| Job coercion | `job-dry-1` → `cancelled`/`restored_from_backup`; `job-dry-2` stays `completed` | PASS |
| Prod safety | Never restored onto production `DATABASE_URL` | PASS |

### Commands (secrets redacted)

```bash
export PATH=/home/box/.local/bin:$PATH
export DOCKER_HOST=tcp://127.0.0.1:2375

docker run -d --name barq-restore-proof-pg \
  -e POSTGRES_USER=barq_proof \
  -e POSTGRES_PASSWORD='***' \
  -e POSTGRES_DB=barq_restore_proof \
  -p 127.0.0.1:55432:5432 \
  postgres:16-alpine

unset DATABASE_URL POSTGRES_URL
export RESTORE_DATABASE_URL='postgresql://barq_proof:***@127.0.0.1:55432/barq_restore_proof'
npm run restore:dry-run -- --snapshot /tmp/barq-restore-proof/snapshot.json

docker exec barq-restore-proof-pg psql -U barq_proof -d barq_restore_proof -c "SELECT count(*) FROM members;"
# …same for promo_codes, bans, support_tickets, clip_links, download_jobs…
```

See `RESTORE_PROOF.md` for the full command set and table.

## Cleanup

```bash
export DOCKER_HOST=tcp://127.0.0.1:2375
docker rm -f barq-restore-proof-pg
rm -rf /tmp/barq-restore-proof
```

Temp DB torn down after proof. Re-run the block above anytime to reproduce.

## Not in this proof (optional owner follow-ups)

- Production `GET /api/backup` dump (admin cookie) restored into a Neon/Supabase clone — same script path; use a real snapshot file instead of the fixture.
- Booting the app with `DATABASE_URL`=`RESTORE_DATABASE_URL` (preview only) and hitting `/api/health`.
- Telegram webhook against a restored clone.
- Rollback drill from clone back to production.

Those are operational drills on top of an already **PROVEN** second-DB migrate+upsert path.

## Policy

- No chat-filter / content-filter re-enable.
- No secrets in this report.
- NEVER restore onto production `DATABASE_URL`.
