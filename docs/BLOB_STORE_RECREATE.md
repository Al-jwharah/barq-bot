# إعادة إنشاء Vercel Blob لـ Barq (عند التعليق)

إذا ظهر في السجلات `BlobStoreSuspendedError` أو `This store has been suspended`، التخزين السحابي معلّق. البوت يخفي CTA رفع الرابط المختصر ويعرض رسالة عربية — لا تُعرض رسالة Vercel الخام للمستخدمين.

## خطوات المالك (لوحة Vercel)

1. افتح [Vercel Dashboard](https://vercel.com/dashboard) → الفريق **abdulrhmaan999-4640s-projects**.
2. اختر المشروع **barq-vid**.
3. من القائمة: **Storage** → **Blob**.
4. إذا ظهر المتجر بحالة **Suspended**:
   - احذف المتجر المعلّق (Delete store) إن لم تعد بحاجة لبياناته القديمة، **أو**
   - أنشئ متجرًا جديدًا: **Create** → **Blob** → اختر المنطقة المناسبة.
5. انسخ **BLOB_READ_WRITE_TOKEN** الجديد.
6. **Settings** → **Environment Variables** → حدّث `BLOB_READ_WRITE_TOKEN` لـ Production + Preview.
7. أعد نشر Preview/Production (Redeploy) حتى تلتقط المتغيرات.
8. تحقق من `/api/health` أن `storage`/`blob` أصبح سليمًا.

## ما يشحنه الكود بدون متجر جديد

- رابط مختصر بعد التحميل عبر Postgres + `/d/:id` عند توفر `mediaUrl`.
- إخفاء زر رفع الملف لرابط مختصر عند تعليق التخزين (`shortLinksAdvertised()`).
- رسائل عربية بدل نص Vercel الخام.
