# RUNBOOK — برق ⚡️ / Barq

Short ops notes. Arabic + English. **No real secrets.** Use env vars and placeholders only.

Current public origin: `BARQ_PUBLIC_ORIGIN=https://barq.abdulrhman.ai`  
Do **not** cut over to the apex until SSL is proven (section 7).

---

## 1. DATABASE_URL

**AR:** عيّن اتصال Postgres في Vercel → Project → Settings → Environment Variables لكل من Production و Preview و Development. إن لم يُضبط `DATABASE_URL` يعمل البناء على PGLite ولا يطبّق `migrate.mjs` شيئًا.

**EN:** Set a Postgres connection string in Vercel → Project → Settings → Environment Variables for Production, Preview, and Development. If `DATABASE_URL` is unset, the app uses PGLite and `migrate.mjs` is a no-op.

```bash
# Vercel — example shape only, never commit a live URL
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB?sslmode=require
```

Restart / redeploy after changing env. Production must use Postgres, not the Blob/PGLite fallback.

Do **not** set `BARQ_REQUIRE_POSTGRES=true` until `DATABASE_URL` is present and read/write + transactions have been tested. Then set it on Production (and Preview if that target also has `DATABASE_URL`). With the flag on and no URL, `getSql()` throws `DATABASE_URL required`.

Neon databases created via claimable Launchpad expire in 72 hours unless claimed to a Neon account.

---

## 2. Migrations — `npm run db:migrate`

**AR:** يطبّق ملفات `migrations/*.sql` مرة واحدة عبر جدول `_migrations`. آمن للإعادة. على Vercel يعمل في نهاية `npm run build`.

**EN:** Applies `migrations/*.sql` once each, recorded in `_migrations`. Safe to re-run. On Vercel this runs at the end of `npm run build`.

```bash
npm run db:migrate
# same as: node scripts/migrate.mjs
# also runs at the end of `npm run build`
```

No `DATABASE_URL` → logs skip and exits 0 (PGLite migrates itself at startup).

---

## 3. GET `/api/backup` — dump

**AR:** تصدير المالك فقط (`owners.manage`). سجّل الدخول أولًا على `/admin` (كوكيز `barq_admin`). لا تضع التوكن أو الـ PIN في الرابط.

**EN:** Owner-only dump (`owners.manage`). Log in at `/admin` first (cookie `barq_admin`). Do not put tokens or the PIN in the URL.

```bash
# after /admin login saved cookies
curl -sS -b cookies.txt "$BARQ_PUBLIC_ORIGIN/api/backup" -o snapshot.json
```

Events: `backup_started` / `backup_completed` (counts only — never snapshot contents).

Keep `snapshot.json` off git and out of chat logs.

---

## 4. POST `/api/backup` — restore

**AR:** يتطلب جلسة إدارة (`hasAdminSession`). الجسم: `{ "confirm": "RESTORE" | "TEST", "snapshot": { ... } }`.  
`TEST` = فحص الشكل فقط (حدث `restore_test_completed`، بلا كتابة).  
`RESTORE` = تطبيق `restoreBackup` (upsert إعدادات/أعضاء/عدادات — لا يمسح الجداول).

**EN:** Requires an admin session (`hasAdminSession`). Body: `{ "confirm": "RESTORE" | "TEST", "snapshot": { ... } }`.  
`TEST` = shape check only (`restore_test_completed`, no writes).  
`RESTORE` = apply `restoreBackup` (upsert settings/members/usage — does not wipe tables).

```bash
# dry-run
curl -sS -b cookies.txt -X POST "$BARQ_PUBLIC_ORIGIN/api/backup" \
  -H "Content-Type: application/json" \
  -d '{"confirm":"TEST","snapshot":'"$(cat snapshot.json)"'}'

# apply (type RESTORE exactly)
curl -sS -b cookies.txt -X POST "$BARQ_PUBLIC_ORIGIN/api/backup" \
  -H "Content-Type: application/json" \
  -d '{"confirm":"RESTORE","snapshot":'"$(cat snapshot.json)"'}'
```

Events: `backup_started` / `backup_completed` with counts only. Never log the snapshot.

**Restore against a second live database is NOT PROVEN.** See `RESTORE_TEST_REPORT.md`. Do not advertise a successful restore.

---

## 5. Rollback — `git revert`

**AR:** لا تعيد كتابة التاريخ على الإنتاج. ألغِ الالتزام المعيب بالتراجع ثم ادفع.

**EN:** Do not rewrite production history. Revert the bad commit, then push.

```bash
git revert HEAD --no-edit
# or a specific sha:
git revert <sha> --no-edit
git push
```

Redeploy. If the bad change was env-only, undo the Vercel env var and redeploy — no git needed.

---

## 6. Webhook re-register

**AR:** الويبهوك = `$BARQ_PUBLIC_ORIGIN/api/telegram`. بعد تغيير الأصل أو السر، أعد التسجيل. `GET /api/health` يفحص الويبهوك فقط ولا يسجّله. التسجيل يتم عبر `ensureWebhook` (مثل `/api/keep`).

**EN:** Webhook URL is `$BARQ_PUBLIC_ORIGIN/api/telegram`. Re-register after origin or secret changes. `GET /api/health` **checks** webhook info; it does not call `setWebhook`. Registration happens in `ensureWebhook` (e.g. `/api/keep`).

```bash
# placeholders only — token and secret come from env
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${BARQ_PUBLIC_ORIGIN}/api/telegram" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\",\"callback_query\",\"pre_checkout_query\",\"my_chat_member\",\"channel_post\"]"

curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

Confirm `url` ends with `/api/telegram` and `pending_update_count` drains.

---

## 7. SSL cutover — do not switch origin until HTTPS works

**Current working origin (keep this):** `https://barq.abdulrhman.ai`

**AR:** لا تنقل `BARQ_PUBLIC_ORIGIN` إلى النطاق الجذري `https://abdulrhman.ai` حتى يعمل HTTPS فعليًا (شهادة + توجيه). الأصل الخاطئ يكسر الويبهوك وروابط `/s/:id` و OG.

**EN:** Do **not** point `BARQ_PUBLIC_ORIGIN` at the apex until HTTPS (cert + routing) actually works. A wrong origin breaks the webhook, `/s/:id` links, and OG.

This cutover is **documented only. Do not perform it now.**

Checklist before any cutover:

1. Apex DNS (`abdulrhman.ai` and `www.abdulrhman.ai`) points at Vercel.
2. Vercel has issued a valid certificate for the apex.
3. Prove TLS from outside:
   ```bash
   curl -sSI https://abdulrhman.ai | head
   curl -sSI https://www.abdulrhman.ai | head
   ```
   Expect HTTP 200/301/308 over HTTPS, not certificate errors.
4. Confirm `https://barq.abdulrhman.ai` still works (rollback host).
5. Then, and only then:
   - Set Production `BARQ_PUBLIC_ORIGIN=https://abdulrhman.ai`
   - Redeploy
   - Re-register the webhook (section 6) to `$BARQ_PUBLIC_ORIGIN/api/telegram`
   - Check `GET /api/health` → `ready: true`, webhook check `ok`
   - Send a test Telegram message and open a `/s/:id` link
6. If anything fails: set `BARQ_PUBLIC_ORIGIN` back to `https://barq.abdulrhman.ai`, redeploy, re-register webhook.

Code never hardcodes the host. Only the env var does.

---

## 8. Worker is still on Vercel `/api/jobs` — not a VPS yet

**AR:** العامل ليس على VPS. التحميل يُصفّ في `download_jobs` ويُنفَّذ عبر `POST /api/jobs` على Vercel (`x-barq-job` = `BARQ_JOB_SECRET`). النداء الداخلي يستخدم `VERCEL_URL` لا النطاق العام. `/api/keep` يفرّغ الانتظار يوميًا.

**EN:** There is no VPS worker yet. Downloads enqueue into `download_jobs` and run via `POST /api/jobs` on Vercel (`x-barq-job` = `BARQ_JOB_SECRET`). The internal kick uses `VERCEL_URL`, not the public origin. `/api/keep` drains the queue on a daily cron.

```bash
curl -sS -X POST "$BARQ_PUBLIC_ORIGIN/api/jobs" \
  -H "Content-Type: application/json" \
  -H "x-barq-job: $BARQ_JOB_SECRET" \
  -d '{}'
```

Do not move the worker off Vercel until a dedicated host exists and the kick URL is updated.

---

## 9. Bans and appeals

**AR:** المحظور يرى رسالة استئناف. يكتب `استئناف` ثم سببًا قصيرًا. المالك: `/appeals` و `/appealok USER_ID` و `/appealno USER_ID`. الحظر: `/ban USER_ID [سبب]`. فك الحظر: `/unban USER_ID`.

**EN:** Banned users get an appeal prompt (`استئناف` + short reason). Owners: `/appeals`, `/appealok USER_ID`, `/appealno USER_ID`. Ban: `/ban USER_ID [reason]`. Unban: `/unban USER_ID`.

Requires `users.unban` (owner). Do not paste user message contents into public channels.

---

## 10. Health

Public `GET /api/health` JSON is slim:

```json
{
  "status": "live | ready | degraded | down",
  "live": true,
  "ready": true,
  "checks": {
    "database": "ok|down",
    "storage": "ok|down",
    "queue": "ok|down|unknown",
    "worker": "ok|down|unknown",
    "telegram": "ok|down",
    "webhook": "ok|down"
  },
  "postgres": true
}
```

- `live=true` means the process answered.
- `ready` is true only with database + Telegram token + webhook secret.
- `status=down` if Postgres/SQL fails; `live` if up but not ready; `degraded` if ready but a check fails; `ready` when all checks pass.
- `GET /api/health?live=1` → 200.
- `GET /api/health?ready=1` → 200 if ready, else 503.
- Never dumps env values, connection strings, tokens, or PINs.
- `?report=1` extra fields require an admin session.

JSON logs (`logJson`): `requestId`, `jobId`, `userId`, `event`, `durationMs`, `status`, `errorCode` (+ cleanup counts). Secrets are redacted.

---

## 11. Cleanup cron

Vercel cron: `GET /api/keep` at `0 4 * * *` (`vercel.json`). That path drains jobs and calls `runCleanup()`.

Flags (defaults):

```
CLEANUP_ENABLED=true
FILE_RETENTION_DAYS=7
TEMP_FILE_RETENTION_HOURS=6
LOG_RETENTION_DAYS=30
```

Cleanup is idempotent: expired clips, stale job rows, old `barq-*` / `barqwm-*` temp dirs, named job dirs, and logs (`download_logs`, `app_events`, `audit_log`). Logs emit deleted **file/byte counts only** — no paths.

---

## 12. News channel `@barq_all`

If the bot cannot post, the text is saved as `pending_news_text` and the owner gets an Arabic error. Downloads are not blocked. Do not claim the channel is linked unless a real `message_id` was stored (`news_last_message_id`).

---

## Don’ts

- Never commit tokens, PINs, `DATABASE_URL`, or snapshot files.
- Never log snapshot JSON (`detail` = counts / mode only).
- Never put the admin PIN in query strings (`?pin=` is obsolete; use `/admin` session).
- Never switch `BARQ_PUBLIC_ORIGIN` off `https://barq.abdulrhman.ai` until apex SSL is proven.
