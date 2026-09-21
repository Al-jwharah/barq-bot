# قائمة إنتاج برق ⚡️

لا تُعلن الجاهزية حتى تكون كل البنود خضراء.

## قبل الفتح للجمهور

- [x] `BARQ_PUBLIC_ORIGIN=https://barq.abdulrhman.ai` (النطاق العامل الآن — لا تقطع إلى الجذر حتى يثبت SSL، انظر RUNBOOK §7)
- [ ] Apex SSL `https://abdulrhman.ai` — **لم يُنفَّذ القطع**
- [x] `TELEGRAM_WEBHOOK_SECRET` في Vercel
- [x] `TELEGRAM_BOT_TOKEN` في Vercel
- [x] `XAI_API_KEY` في Vercel
- [x] `BARQ_ADMIN_PIN` في Vercel
- [x] `BLOB_READ_WRITE_TOKEN` في Vercel
- [x] `DATABASE_URL` Postgres مُدار (Neon) في Production / Preview / Development
- [x] `BARQ_REQUIRE_POSTGRES=true` في Production فقط بعد نجاح الاتصال
- [x] Migrations `0002`…`0020` مطبّقة على Postgres
- [ ] `BARQ_MAINTENANCE=off` عندما تريد التحميل
- [ ] لا أسرار في المستودع (`npm test` يشمل secrets.test)
- [x] `GET /api/health` → `ready: true` وقاعدة البيانات Postgres لا PGlite (الشكل: `status/live/ready/checks/postgres`)
- [ ] Webhook = `$BARQ_PUBLIC_ORIGIN/api/telegram`
- [ ] نسخة احتياطية: `GET /api/backup` بعد تسجيل الدخول في `/admin`
- [ ] استعادة على قاعدة ثانية: **NOT PROVEN** — انظر `RESTORE_TEST_REPORT.md`
- [x] تنظيف: `CLEANUP_ENABLED=true` · `FILE_RETENTION_DAYS=7` · `TEMP_FILE_RETENTION_HOURS=6` · `LOG_RETENTION_DAYS=30`
- [ ] قناة `@barq_all`: لا تُعلن الربط بدون `message_id` حقيقي

## Postgres

لا تفعّل `BARQ_REQUIRE_POSTGRES=true` قبل ضبط `DATABASE_URL` واختبار القراءة/الكتابة والمعاملات.

بعد التفعيل: التطبيق يرفض تشغيل الإنتاج بدون Postgres (`DATABASE_URL required`). المعاينة المحلية تبقى على PGlite إن لم يُضبط الرابط.

قاعدة Neon الحالية claimable — يجب ربطها بحساب Neon عبر رابط المطالبة خلال 72 ساعة وإلا تُحذف.

## اختبار تليجرام الحقيقي

1. `/start` → بطاقات أول استخدام
2. إرسال رابط ديني/مضحك بلا موسيقى → طابور → ملف
3. `حالة برق` → حالة التحميل والذكاء والطابور
4. رسالة لـ Barq AI
5. تقييم ⭐ بعد أول تحميل
6. أغنية تُرفض باعتذار — إباحي يحظر
7. `/unban USER_ID` يفك الحظر
8. لوحة `/admin` تبويب النمو: DAU و D1/D7/D30 والطابور

## الطابور

الويبهوك يُنشئ `download_jobs` ويستدعي `/api/jobs` في عزل منفصل.
إن فشل النداء يُعالج محليًا كاحتياط.
المهام العالقة أكثر من 3 دقائق تُعاد إلى `pending`.
`/api/keep` يفرّغ الانتظار يوميًا ويستدعي التنظيف.

## المراقبة

`/api/health` يعرض `status` (`live`/`ready`/`degraded`/`down`) و `live`/`ready` و `checks` و `postgres`.
لا قيم env ولا توكنات في JSON العام.
`/admin` → الطابور والنمو.
JSON logs: `requestId, jobId, userId, event, durationMs, status, errorCode` مع حجب الأسرار.
