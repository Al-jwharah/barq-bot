# برق ⚡️ — barq-vid

بوت تليجرام لتحميل المقاطع **الإسلامية والقصص والضحك بلا موسيقى**، مع Barq AI ولوحة تشغيل.

## المعمارية

```
Telegram → POST /api/telegram
                │
                ├─ فحص أمان + معدل الطلبات
                ├─ enqueue download_jobs
                └─ Worker (/api/jobs + نفس الطلب كاحتياط)
                       │
                       ├─ extract (منصات + yt-dlp)  [حتى 3 محاولات]
                       ├─ deliver → Telegram
                       └─ رابط 24 ساعة /s/:id
```

- الاستضافة: Vercel (fra1)
- قاعدة البيانات: PGlite + Vercel Blob، أو Postgres عبر `DATABASE_URL`
- الذكاء: xAI Grok مع نماذج احتياطية grok-4.5 → grok-4 → grok-3

## التشغيل المحلي

```bash
cp .env.example .env
# عبّئ TELEGRAM_BOT_TOKEN و XAI_API_KEY و BARQ_ADMIN_PIN
npm install
npm run dev
```

المعاينة على المنفذ 8080. الويبهوك في الإنتاج: `$BARQ_PUBLIC_ORIGIN/api/telegram`.

## المتغيرات

انظر `.env.example`.

| مفتاح | الغرض |
|---|---|
| BARQ_PUBLIC_ORIGIN | النطاق العام الوحيد (روابط، ويبهوك، OG) |
| TELEGRAM_BOT_TOKEN | توكن البوت |
| XAI_API_KEY | Grok |
| BARQ_ADMIN_PIN | لوحة `/admin` و `/api/backup` |
| BARQ_OWNER_IDS | ملاك مفصولون بفاصلة |
| BARQ_MAINTENANCE | on = اعتذار للمستخدمين |
| BARQ_TEMP_FREE | on = بدون باي وول |
| BARQ_SUBSCRIPTIONS_LIVE | off حتى الإطلاق. بلس 4.99 ر.س / ماكس 19.99 ر.س بالنجوم |
| BLOB_READ_WRITE_TOKEN | ثبات البيانات على Vercel |

**لا تضع أسرارًا في الكود.**

## النشر

1. متغيرات Vercel مضبوطة
2. `npm run build`
3. ويبهوك: `$BARQ_PUBLIC_ORIGIN/api/telegram`
4. صحة: `GET /api/health`
5. طابور: `POST /api/jobs` مع رأس `x-barq-job`
6. نسخة احتياطية: `GET /api/backup?pin=...`

## الأدوار

OWNER / ADMIN / MODERATOR / SUPPORT

- OWNER: كل شيء
- ADMIN: مستخدمون وإعدادات
- MODERATOR: حظر ومراجعة
- SUPPORT: سجلات فقط

## الباقات

- FREE: حد يومي
- PRO: 50 نجمة / 30 يوم
- VIP: 150 نجمة / بلا حد

الدفع عبر Telegram Stars مع رفض `charge_id` المكرر.

## المحتوى

طبقات الحجب: النطاق → البيانات الوصفية → Grok → مراجعة يدوية في اللوحة.

الإباحي/+18 يحظر الحساب. الأغاني والحريم: اعتذار.

## استكشاف الأعطال

| عرض | فحص |
|---|---|
| البوت لا يرد | `/api/health` والتوكن والويبهوك |
| فيديو إكس لا يصل | العامل يرفع الملف بعد Referer |
| أكواد تضيع | `BLOB_READ_WRITE_TOKEN` |
| رسالة صيانة | `BARQ_MAINTENANCE=off` |

الدعم: [@i_2169](https://t.me/i_2169) · info@aljwharah.ai
