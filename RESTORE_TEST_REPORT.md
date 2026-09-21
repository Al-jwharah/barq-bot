# Restore test report — برق ⚡️

**Verdict: NOT PROVEN**

Date: 2026-09-21

## What exists

- `GET /api/backup` dumps a JSON snapshot (settings, codes, members, usage) after owner/admin auth (`owners.manage` / `barq_admin` cookie).
- `POST /api/backup` requires an admin session.
  - `{ "confirm": "TEST", "snapshot": … }` runs `restoreTest()` — shape check only, **no writes**.
  - `{ "confirm": "RESTORE", "snapshot": … }` runs `restoreBackup()` — upsert into the **current** database. It does not wipe tables.

Logs record counts / mode only. Snapshot JSON is not logged. This report does not print `DATABASE_URL` or any other secret.

## What was not done

A restore was **not** executed against a second, live clone of production Postgres.

Not proven:

- Dump from production Postgres → restore into a separate empty/cloned database
- Row counts matching after restore
- Members, settings, codes, and usage readable on the clone
- Application boot + Telegram webhook against the restored clone
- Rollback from the clone back to production

`restoreTest` only validates object shape in-process. That is not a restore.

## Why not

No second database URL was available in this environment, and printing or using a live `DATABASE_URL` is forbidden here. Inventing a successful restore would be dishonest.

## How to prove it later (do not run until a clone exists)

1. Create a **separate** Neon/Postgres database (not production).
2. Dump via `GET /api/backup` while logged in at `/admin`. Keep `snapshot.json` off git.
3. Point a throwaway preview at the clone URL (do not paste the URL into chat or this file).
4. `POST /api/backup` with `confirm: TEST`, then `confirm: RESTORE`.
5. Compare member/settings/usage counts. Boot the app against the clone. Send a test Telegram message.
6. Record pass/fail here. Until that happens, the status stays **NOT PROVEN**.
