# DATA_MIGRATION_REPORT

Date: 2026-09-21  
Scope: PGlite → Postgres. **No secrets, tokens, or connection strings.**

## Verdict

**Schema is live. Historical PGlite rows were not copied into the new database.**

This is not a completed data migration. Owners recover on `/start`. A dump-copy script exists if a local dump file is provided later.

## Target

| Item | State |
|------|--------|
| Engine | Postgres (managed) |
| Host | Supabase project **barq-vid** |
| Migrations applied | `0002_barq.sql` … `0021_constraints.sql` (`_migrations` bookkeeping) |
| Auth schema | `migrations/auth/0001_auth.sql` stays opt-in (subdirectory is not auto-applied) |
| Historical rows in the new DB | **No** — a **fresh** schema was applied after the last known PGlite snapshot |

Driver notes (code only, no URLs): `scripts/migrate.mjs`, `scripts/migrate-pglite-dump.mjs`, and `src/lib/db.ts` add `sslmode=require` and `uselibpqcompat=true` when the hostname is `*.supabase.co` / `*.supabase.com`.

## Last known PGlite snapshot (not in the new DB)

Counted on a prior dump. **Not re-counted in this pass. Not imported into barq-vid.**

| table        | source_rows |
|--------------|-------------|
| members      | 2           |
| bot_settings | 18          |
| promo_codes  | 2           |

After that snapshot, a **fresh Supabase schema** was applied (`0002`–`0021`). Those historical rows are **not** in the new database. Do not treat current member/settings/promo counts as a copy of the dump.

This workspace has no dump file and no `DATABASE_URL` / `BLOB_READ_WRITE_TOKEN` in the agent environment. Production blob key `barq-pglite.dump` (`BLOB_DUMP_KEY` in `src/lib/db.ts`) was **not** fetched.

## Copy tool (re-run if a dump file is provided)

`scripts/migrate-pglite-dump.mjs` is local-file-only. It does not pull from Blob. Never commit a dump.

```bash
# after placing a dump locally — never commit the file
PGLITE_DUMP_PATH=./barq-pglite.dump node scripts/migrate-pglite-dump.mjs --dry-run
DATABASE_URL=… node scripts/migrate-pglite-dump.mjs ./barq-pglite.dump
```

Behavior:

- Opens the file with `@electric-sql/pglite` `loadDataDir`
- Reads tables that exist: `members`, `bot_settings`, `promo_codes`, `bans`, `support_tickets`, `download_jobs`, `clip_links`, `user_feedback`, `usage_counters`, `ai_usage`, `audit_log`
- UPSERT: `ON CONFLICT DO NOTHING` (serial logs) or `DO UPDATE … WHERE dump_ts > dest_ts` (does not clobber newer Postgres rows)
- Output is `table / source_rows / inserted / skipped` only — never row contents

**This pass did not run the copy against barq-vid.** Re-run only when a dump file is in hand.

## Owners

Telegram owners `8471762251` and `5554780316` (`BARQ_OWNER_IDS` / `BARQ_OWNER_TG_ID`) are **upserted on `/start`** (`upsertMember` sets `is_admin` when `isOwnerId`). They do not need to be seeded from the dump for ownership to recover. That is membership recovery, not a row-for-row migration.

## PGlite (not deleted)

PGlite is **not** removed. It remains the **local preview** backend when `DATABASE_URL` is unset.

Production must set `DATABASE_URL` and `BARQ_REQUIRE_POSTGRES=true` so `getSql()` cannot silently open PGlite. Blob is for media files, not a transactional store.

## Tests

`node --test scripts/migrate-pglite-dump.test.mjs` — UPSERT SQL builder, dry-run against a fake row set, and a fake-dest `upsertRows` counter. **No live database. Not a production import.**
