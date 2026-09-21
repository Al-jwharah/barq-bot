# مراجعة أمنية — برق ⚡️ / Security Review

تاريخ المراجعة: 2026-09-21  
النطاق: كود المستودع الحالي فقط. ليست اختبار اختراق ولا تدقيق طرف ثالث.  
**لا أسرار مطبوعة في هذا الملف.**

## Verdict

**Not ready for public launch.**

P0 controls in code are present. Operational gaps remain: no dedicated worker (Vercel `waitUntil` only), restore on a separate database is **not proven**, no live 10/25/50 load test, readable-secret env vars must be rotated by the owner, a leaked Supabase PAT must be revoked if one exists, news-channel admin is an ops step, apex SSL cutover is **not done**, PGlite historical rows were **not** copied into Supabase barq-vid. Do not announce a public launch.

---

## Controls in code (current)

### سر الويبهوك — webhook secret
`TELEGRAM_WEBHOOK_SECRET` إلزامي. `src/lib/bot/webhook-guard.ts` يطابق الرأس `x-telegram-bot-api-secret-token` بـ `timingSafeEqual`. القيمة الفارغة ترفض **كل** الطلبات (بما فيها الرأس الفارغ). JSON + POST فقط. المسار: `POST /api/telegram`.

### FSM المهام — job status including uploading → cancelled
`pending|processing|uploading → cancelled` مسموح (`src/lib/jobs/job-status.ts`). العامل يقتل العملية عبر `proc-registry` (SIGKILL). `completed/expired/cancelled` لا تُعاد إلى معالجة.

### spawn
`yt-dlp` عبر `spawn("yt-dlp", args, { shell: false })` — argv فقط، بدون سلسلة shell. stderr لا يُسجَّل (كوكيز/رؤوس).

### SSRF
`src/lib/media/ssrf.ts`: حظر `file:` / `data:` / localhost / metadata / IPv4 و IPv6 الخاصة قبل الجلب وyt-dlp. DNS يُحلَّل ثم يُفحص الـ IP.

### PIN hash — جلسة المشرف
PIN عبر **scrypt** (`hashPin` / `verifyPin`)، مقارنة `timingSafeEqual`. كوكي `barq_admin`: httpOnly + Secure + SameSite=strict، HMAC، TTL 4 ساعات. قفل بعد 5 محاولات / 15 دقيقة. لا تُطبع قيمة PIN. الإنتاج يفضّل `BARQ_ADMIN_PIN_HASH`.

### CSRF
لوحة `/admin` ترسل `x-barq-csrf` (HMAC لجلسة المشرف). `assertCsrf` على الطفرات.

### Postgres fail-closed
`getSql()` يرمي `DATABASE_URL required` عندما `BARQ_REQUIRE_POSTGRES` = `true|1|on` و`DATABASE_URL` غائب — لا سقوط صامت إلى PGlite. المعاينة المحلية: `BARQ_REQUIRE_POSTGRES=false` في `.env.example`. هدف الإنتاج: Supabase **barq-vid**.

### منع تكرار التحديثات والمهام
جدول `telegram_updates` (`claimTelegramUpdate`) يمنع إعادة معالجة `update_id`.  
`download_jobs.update_id` فريد + `job_key` (رابط مطبّع + مستخدم) يمنع تكرار التحميل.  
`0021_constraints.sql` يثبت فهارس فريدة إضافية إن لم تكن موجودة.

### الحظر والاستئناف — ban appeals
`members.is_banned` + جدول `bans`. المستخدم المحظور يرى تعليمات الاستئناف (`استئناف` / `/appeal`). المالك: `/appeals` `/appealok` `/appealno`. إشعار المالكين عند طلب جديد. `users.unban` للمالك فقط.

### مساعد الأصل
`src/lib/bot/origin.ts` يقرأ `BARQ_PUBLIC_ORIGIN` فقط. التحويل الكانوني: www → apex. أصل العامل الداخلي = `VERCEL_URL`. الأصل العامل: `https://barq.abdulrhman.ai`.

### النسخ الاحتياطي
`GET/POST /api/backup` محمي بجلسة إدارة. السجلات: أعداد فقط. **الاستعادة على قاعدة منفصلة غير مثبتة.**

### حارس الـ commit
`scripts/secret-commit-guard.mjs` يرفض الملفات المُدرجة إذا طابقت توكن تليجرام / `xai-` / `sbp_` / رابط Postgres بكلمة سر. الرسالة: `secret-like pattern in <path>` بدون طباعة القيم.

---

## Remaining risks (honest)

| بند | الحالة |
|-----|--------|
| لا عامل منفصل | الطابور يُصرف داخل `/api/jobs` + `waitUntil` على نفس السيرفرلس. **dedicated worker still pending.** |
| لا استعادة مثبتة | POST `/api/backup` موجود. لا بروفة على قاعدة منفصلة. **restore NOT PROVEN.** |
| لا اختبار حمل حي | `load-sim.test.ts` محاكاة `job_key` فقط. لا 10/25/50 مستخدم على الإنتاج. **cannot pass public-launch load criteria.** |
| بيانات PGlite | آخر لقطة معروفة: 2 أعضاء / 18 إعدادًا / 2 أكواد ترويج. سكيمة Supabase طُبّقت فارغة — الصفوف التاريخية **ليست** في barq-vid. الملاك يُدرجون عند `/start`. |
| تدوير الأسرار | Owner must rotate readable-secret env vars (أسماء فقط في `RUNBOOK.md`). لا تُعاد طباعة القيم هنا. |
| Supabase PAT | Revoke any leaked Supabase PAT (`sbp_…`) and mint a new one. Do not paste the old value into git or this file. |
| قناة التحديثات | `@barq_all` تحتاج صلاحية **news channel admin** للبوت قبل النشر. |
| شهادة apex SSL | النطاق العامل: `https://barq.abdulrhman.ai`. **SSL cutover NOT done.** لا تنتقل إلى apex حتى يثبت HTTPS. |
| PGlite إن غاب Postgres | بدون `DATABASE_URL` ومع العلم مطفأ، الحالة داخل Lambda + dump على Blob. خطر فقدان/سباق cold start. PGlite **لم يُحذف** (معاينة محلية). |
| حدود المعدل في الذاكرة | عند فشل SQL: fallback Map — لا يتشارك عبر instances. |
| لقطة النسخ الاحتياطي ناقصة | `restoreBackup` لا يعيد `promo_codes` ولا الوظائف/الحظر/التذاكر/المقاطع. |

---

## قيم ثابتة متبقية — residual hardcoded

`config.server.ts` فيه fallback إن غاب env:

- `OWNER_TG_ID` / `OWNER_IDS` — معرّفات المالكين
- `VAULT_INVITE` (+ `VAULT_CHAT_ID`) — دعوة القناة المغلقة

**يجب أن يتجاوزها env:** `BARQ_OWNER_TG_ID`, `BARQ_OWNER_IDS`, `BARQ_VAULT_INVITE`. الدعوة الخاصة سر تشغيلي حتى مع override.

---

## توصيات قصيرة

1. Postgres مُدار على Supabase barq-vid + `BARQ_REQUIRE_POSTGRES=true` في prod فقط بعد نجاح الاتصال.
2. عامل طابور معزول عن طلب الويبهوك — `waitUntil` لا يكفي.
3. تدوير كل الأسرار الظاهرة readable-secret (أسماء في RUNBOOK)، وإلغاء أي Supabase PAT مسرّب، وأي PIN في git history.
4. بروفة restore على dump حي **على قاعدة منفصلة** — لا تدّعِ النجاح قبلها.
5. حمل 10/25/50 مستخدم تليجرام حي قبل الإعلان العام — المحاكاة الحالية لا تمرّر معيار الإطلاق.
6. إضافة البوت مشرفًا على قناة التحديثات.
7. لا تغيّر `BARQ_PUBLIC_ORIGIN` عن `https://barq.abdulrhman.ai` حتى يثبت apex SSL (**cutover NOT done**).
8. بعد تدوير `TELEGRAM_WEBHOOK_SECRET` أعد تسجيل `https://barq.abdulrhman.ai/api/telegram`.
9. إن وُجد ملف dump محلي، أعد `scripts/migrate-pglite-dump.mjs`؛ لا تفترض أن الصفوف التاريخية وصلت.

---

## Secret rotation (owner)

Do **not** rotate from this checkout or any agent. Owner-only, in Vercel → Project → Settings → Environment Variables (Production, Preview, Development), then redeploy. Names only — never paste values into git, issues, or chat.

Rotate these names if git history ever held a live value:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `XAI_API_KEY`
- `BARQ_ADMIN_PIN`
- `BARQ_JOB_SECRET`
- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`

Owner steps:
1. Issue a new value at the provider (BotFather / xAI / Vercel Blob / Postgres).
2. Set the new value on that name in Vercel for Production + Preview + Development.
3. Redeploy. Confirm `GET /api/health` reports ready (booleans only; no `?report=1` unless an admin session).
4. Revoke the old provider credential after the new deploy is healthy.

*هذا الملف توثيق مراجعة. لا يحتوي قيمًا سرية. **Not ready for public launch.***
