# Always-on worker (Architecture B)

Vercel stays the webhook/UI edge. Heavy `download_jobs` extract (yt-dlp + ffmpeg) runs on an always-on worker (Fly / Railway / Docker).

## Cutover checklist

1. **Build locally**
   ```bash
   docker build -t barq-worker .
   ```
2. **Smoke without Telegram** (dry claim against a non-prod DB):
   ```bash
   docker run --rm -p 8080:8080 \
     -e DATABASE_URL="$DATABASE_URL" \
     -e BARQ_JOB_SECRET="$BARQ_JOB_SECRET" \
     -e BARQ_REQUIRE_POSTGRES=on \
     -e BARQ_WORKER_DRY_RUN=on \
     -e PORT=8080 \
     barq-worker
   curl -s localhost:8080/healthz
   ```
3. **Owner: Fly account** (agents do not create secrets / deploy without token)
   ```bash
   fly auth login
   fly apps create barq-worker --org <your-org>   # or reuse app name in fly.toml
   fly regions set fra                            # or ams — near Neon/Vercel fra1
   ```
4. **Owner: set Fly secrets** (names only below — paste values yourself)
   ```bash
   fly secrets set \
     DATABASE_URL=… \
     BARQ_JOB_SECRET=… \
     TELEGRAM_BOT_TOKEN=… \
     TELEGRAM_WEBHOOK_SECRET=… \
     BARQ_PUBLIC_ORIGIN=https://… \
     BLOB_READ_WRITE_TOKEN=… \
     DOWNLOAD_TIMEOUT_MS=270000 \
     MAX_CONCURRENT_JOBS=3 \
     BARQ_REQUIRE_POSTGRES=on
   ```
5. **Deploy worker**
   ```bash
   fly deploy
   fly status
   curl -s https://barq-worker.fly.dev/healthz
   ```
6. **Owner: Vercel env (proposals — do not set from this branch)**
   - `BARQ_EXTERNAL_WORKER=on`
   - `WORKER_WAKE_URL=https://barq-worker.fly.dev/wake`
   - Keep existing `BARQ_JOB_SECRET` / `DATABASE_URL` (same values as Fly).
   - Suggested: `DOWNLOAD_TIMEOUT_MS=270000` (≤270s) so stuck reclaim ≤ Fluid Hobby max. **Do not set from agents.**
7. **Verify**
   - Enqueue a real URL via Telegram.
   - Worker `/healthz` shows `claimed` rising; Vercel `/api/jobs` with flag on returns `{ external: true }` without long extract.
   - `DOWNLOAD_FAILED_SPAWN` should stop for missing yt-dlp.
8. **Rollback**
   - Vercel: `BARQ_EXTERNAL_WORKER=off` (or unset) → kicks drain on Vercel again.
   - Optionally `fly scale count 0` after traffic is back on serverless.
   - Leave Fly secrets in place for a fast re-enable.

## ENV list (names only)

| Name | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Fly + Vercel | Same Postgres as production queue |
| `BARQ_JOB_SECRET` | Fly + Vercel | Shared wake / `/api/jobs` auth (`x-barq-job`) |
| `TELEGRAM_BOT_TOKEN` | Fly | Delivery from worker |
| `TELEGRAM_WEBHOOK_SECRET` | Vercel (webhook) | Unchanged |
| `BARQ_PUBLIC_ORIGIN` | Both | Public links |
| `BLOB_READ_WRITE_TOKEN` | Fly | Blob media if used |
| `BARQ_EXTERNAL_WORKER` | Vercel | `on` = wake/poll only on edge |
| `WORKER_WAKE_URL` | Vercel | Full URL to worker `POST /wake` |
| `BARQ_WORKER_DRY_RUN` | Worker only | `on` = claim+complete, no Telegram/extract |
| `DOWNLOAD_TIMEOUT_MS` | Worker (suggest ≤270000) | Job deadline / stuck reclaim |
| `MAX_CONCURRENT_JOBS` | Worker | Drain concurrency (default 3, max 8) |
| `WORKER_IDLE_MS` | Worker | Idle poll backoff (default 1500) |
| `PORT` | Worker | HTTP health/wake (default 8080) |
| `FFMPEG_PATH` | Worker | Default `/usr/bin/ffmpeg` |
| `BARQ_REQUIRE_POSTGRES` | Worker | `on` — refuse PGLite |
| `CRON_SECRET` | Vercel | `/api/keep` Bearer (optional, same as job secret) |

Agents **must not** create/modify/delete Vercel or Fly secrets.

## Local (non-Docker)

```bash
npm install
BARQ_REQUIRE_POSTGRES=on BARQ_WORKER_DRY_RUN=on \
  DATABASE_URL=… BARQ_JOB_SECRET=… \
  npx tsx src/worker/main.ts
```

Unit tests (no Telegram / no DB drain):

```bash
npx tsx --test src/worker/flags.test.ts src/worker/loop.test.ts src/worker/wake.test.ts
npx tsx --test src/lib/jobs/worker-claim.test.ts
```

## Manual Fly deploy steps (owner)

1. `fly auth login`
2. Create app + set `primary_region` (`fra` or `ams`) in `fly.toml`
3. `fly secrets set …` (table above)
4. `fly deploy`
5. Set Vercel `BARQ_EXTERNAL_WORKER=on` + `WORKER_WAKE_URL`
6. Watch `/healthz` + one real download
7. Rollback = flip `BARQ_EXTERNAL_WORKER=off`

## What waits on owner

- Fly account login / org billing
- Setting all secrets (values never committed)
- Vercel dashboard env for cutover flag + wake URL
- Optional Railway instead of Fly (`railway.json` included)
