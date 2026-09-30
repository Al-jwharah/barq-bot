# قائمة إنتاج برق ⚡️

لا تُعلن الجاهزية حتى تُغلق البنود الحمراء. المنسّق ينشر مرة واحدة — **لا تنشر من هذا الفرع.**

## أخضر بعد هذه الدفعة (كود / إعداد موثّق)

- [x] حماية `/api/keep` و `/api/jobs` عبر `authorizeJobRequest` (`x-barq-job` / `?secret=` / body / Bearer). GET بلا سر → `{ ok: true }` بلا إحصاءات.
- [x] `CRON_SECRET`: Bearer مقبول على keep/jobs مع أو بدل `BARQ_JOB_SECRET`. عيّن الاثنين في Vercel (يفضّل نفس القيمة).
- [x] مسار serverless للطابور: webhook → reclaim + drain؛ enqueue → `kickJobWorker`؛ `/api/jobs` self-kick (عمق ≤ 1 + تأخير قصير/jitter، ميزانية drain≈5، 503 عند تشبّع DB)؛ `/api/keep` يوميًا reclaim+drain(8) ثم kick إن بقي `pending`.
- [x] تنبيه تشغيل: `runOpsAlerts` إذا `pending >= 5` أو مهمة عالقة / فشل يومي (من keep).
- [x] Soft launch: `BARQ_LAUNCH_MAX` افتراضي **500**؛ `BARQ_TEMP_FREE=on`؛ `/start` بلا اعتذار صيانة؛ لوحة FREE مختصرة قبل أول تحميل.
- [x] استعادة: dry-run محسّن — **استعادة حية على قاعدة ثانية: PROVEN** (انظر `RESTORE_PROOF.md`).
- [x] `BARQ_PUBLIC_ORIGIN=https://barq.abdulrhman.ai` (لا تقطع إلى الـ apex قبل إثبات SSL).
- [x] أسرار Vercel الحاضرة بالاسم: `TELEGRAM_BOT_TOKEN`, webhook secret, XAI, admin pin/hash, Blob, `DATABASE_URL`, `BARQ_REQUIRE_POSTGRES` على Production بعد نجاح الاتصال.
- [x] تنظيف: `CLEANUP_ENABLED` + احتفاظ الملفات/المؤقت/السجلات.

## أحمر — حواجز إطلاق حقيقية

- [ ] **عامل دائم (always-on worker)** — **مطلوب لحركة فيروسية**. غير منشور؛ الاعتماد على Vercel `waitUntil` + self-kick المخفّف. لا يكفي لحمل فيروسي حتى مع تخفيف kick-storm.
- [ ] **حمل متوازي على `/api/jobs`** — ما زال يُقيّد الإطلاق الواسع. تخفيف kick-storm منشور (ميزانية ≈5، self-kick×1+jitter قصير، cooldown reclaim، pool≈4، 503 على EMAXCONNSESSION). إعادة فحص خفيف ×5/×10 بعد النشر؛ موجات 25/50 السابقة فشلت بـ HTTP 500.
- [ ] **Webhook** = `$BARQ_PUBLIC_ORIGIN/api/telegram` — أكّد `getWebhookInfo` بعد آخر نشر.
- [ ] **`BARQ_MAINTENANCE=off`** عند فتح التحميل (الكود افتراضيًا off؛ تأكد من Vercel). **لا تُغيّر من هذا الفرع دون طلب صريح.**
- [ ] **مقاعد Soft beta**: اضبط `BARQ_LAUNCH_MAX` في لوحة Vercel (500–1000) عند التوسيع — لا تغيّر أسرار Vercel من المستودع.
- [ ] **Apex SSL** `https://abdulrhman.ai` — القطع **لم يُنفَّذ**.
- [x] **نسخة احتياطية حية + استعادة على قاعدة ثانية**: **PROVEN** (وكيل آخر؛ `RESTORE_PROOF.md` / `RESTORE_TEST_REPORT.md`).
- [ ] **قناة التحديثات**: لا تعلن الربط بدون `message_id` حقيقي.
- [ ] Neon claimable: اربط القاعدة خلال مهلة المطالبة إن لزم.

## سياسة محتوى (قفل)

- **لا تُعِد تفعيل فلاتر الموسيقى/الإباحية** في هذه الدفعة. ميزات جديدة مسموحة. **ممنوع طباعة الأسرار.**

## Cron / الخطة

- `vercel.json`: `/api/keep` @ `0 4 * * *` (يومي).
- **Hobby lock:** المشروع على فريق Hobby. Hobby = cron يومي فقط — لا ترفع التكرار.
- فريق Pro `abdulrhman-app`: **لا يوجد مشروع barq** (تحقق 2026-09-22). **لا تُرحّل** دون دليل ملكية/مشروع قائم.

## الطابور (ملخص)

1. Webhook: `drainJobs` أولاً ثم `reclaimStuckJobs` (cooldown) ثم `kickJobWorker` إن بقي pending.
2. `/api/jobs`: reclaim (عمق 0 فقط + cooldown) + drain (≈5، `JOBS_DRAIN_BUDGET`) + self-kick واحد سريع (`x-barq-kick-depth` ≤ 1)؛ تشبّع DB → 503 + Retry-After.
3. `/api/keep` (يومي / يدوي بمصادقة): reclaim + drain (8، مهلة ~28s) + kick إن بقي pending + تنظيف/تنبيهات.

## مراقبة

`GET /api/health` → status/live/ready/checks/postgres بلا أسرار.  
`/admin` → الطابور والنمو.  
JSON logs: requestId/jobId/userId/event/durationMs/status/errorCode مع حجب الأسرار.
