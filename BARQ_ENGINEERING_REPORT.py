# =============================================================================
# BARQ ⚡️ — تقرير هندسي كامل (نسخ سريع)
# المشروع: barq-vid | الوقت: 2026-09-19
# الاستخدام: انسخ الملف كاملًا. لا يحتاج تشغيل. dict توثيقي فقط.
# =============================================================================

REPORT = {
    "identity": {
        "name_ar": "برق ⚡️ لتحميل الفيديوهات",
        "brand": "برق",
        "telegram_username": "@barq_ibot",
        "channel": "@barq_all",
        "support_user": "@i_2169",
        "support_email": "info@aljwharah.ai",
        "github": "https://github.com/Aljwharah-ai/barq-vid",
        "vercel_prod": "https://barq-vid.vercel.app",
        "region": "fra1",
        "bot_id": "8981650390",
        "commit": "d3d7204",
    },

    "owners": {
        "primary_tg_id": "8471762251",
        "co_owner_tg_id": "5554780316",  # @ohm2202
        "admin_pin": "Barq7942",
        "note": "isOwnerId() يطابق أيًا من الاثنين. لوحة المالك + Barq AI بلا حد.",
    },

    "live_flags": {
        "MAINTENANCE": True,          # أي مستخدم غير المالك → رسالة اعتذار فقط
        "TEMP_FREE": True,            # لا اشتراك / لا باي وول
        "restrictions_on": False,     # إلزام القناة/الإعلان مطفأ (يُفعّل لاحقًا)
        "ads_enabled": False,
        "porn_filter": True,          # دائم — لا يُوقف
        "barq_ai_daily": 10,          # لغير المالك
        "clip_ttl_hours": 24,
        "coffee_stars": 50,
        "coffee_title": "كوب قهوة للمطور",
        "maintenance_text": (
            "نعتذر عن البداية السيئة ⚡️\n\n"
            "البوت تحت التطوير، وسيعود للعمل بشكل جديد قريبًا."
        ),
    },

    "purpose": {
        "allowed": ["مقاطع إسلامية/دينية", "قصص نافعة", "ضحك بلا موسيقى"],
        "blocked": ["أغاني/موسيقى", "محتوى حريم", "إباحي/+18"],
        "ban_on": ["porn_film", "nsfw", "domain"],  # يحظر حساب المرسل
        "apology_only_on": ["music", "women"],
        "unban_cmd": "/unban USER_ID",
    },

    "stack": {
        "runtime": "Node.js + TypeScript (ESM)",
        "web": "TanStack Start + Vite + React 19 + Tailwind 4",
        "host": "Vercel serverless (hobby cron مرة/يوم 04:00)",
        "db": "PGlite (WASM Postgres) + dump على Vercel Blob إن وُجد BLOB_READ_WRITE_TOKEN",
        "db_fallback": "Neon/Postgres إذا DATABASE_URL مضبوط",
        "ai": "xAI Grok (grok-4.5 / grok-4 / grok-3)",
        "media": "مستخرجات خاصة + yt-dlp",
        "payments": "Telegram Stars (XTR) — فاتورة 50 نجمة بعد كل فيديو",
        "blob": "@vercel/blob لمفاتيح: barq-pglite.dump, barq-promo-codes.json, clip links",
    },

    "env_keys": {
        "TELEGRAM_BOT_TOKEN": "توكن البوت (موجود في Vercel + fallback في config)",
        "XAI_API_KEY": "مفتاح Grok (موجود في Vercel + fallback في config)",
        "BLOB_READ_WRITE_TOKEN": "ثبات PGlite/أكواد/كليبات على Vercel",
        "DATABASE_URL": "اختياري — إن فُرغ يُستخدم PGlite",
        "GROK_PROJECT_ID": "يميز النشر عن معاينة Grok",
        "VERCEL": "تلقائي على المنصة",
    },

    "urls": {
        "webhook": "POST https://barq-vid.vercel.app/api/telegram",
        "health": "GET  https://barq-vid.vercel.app/api/status",
        "keep_cron": "GET  https://barq-vid.vercel.app/api/keep",
        "keep_probe": "GET  /api/keep?probe=Barq7942",
        "short_clip": "GET  https://barq-vid.vercel.app/s/{id}   # ينتهي بعد 24س",
        "landing": "GET  https://barq-vid.vercel.app/",
        "admin_web": "GET  https://barq-vid.vercel.app/admin",
        "deep_link": "https://t.me/barq_ibot?start=try",
        "channel": "https://t.me/barq_all",
        "support": "https://t.me/i_2169",
    },

    "tree": """
barq-vid/
├── vercel.json                 # fra1 + cron /api/keep يوميًا 04:00
├── package.json                # build = vite + pglite assets + migrate
├── vite.config.ts
├── startup.sh
├── migrations/
│   ├── 0002_barq.sql           # members, promo_codes, download_logs, payments
│   ├── 0003_barq_grok.sql      # bot_settings, filter_events, grok_notes
│   ├── 0004_barq_panel.sql
│   ├── 0005_barq_runtime.sql
│   ├── 0006_channel_hub.sql
│   ├── 0007_clip_expiry.sql    # clip_links.expires_at
│   ├── 0008_ai_turns.sql
│   └── 0009_ban.sql            # members.is_banned
├── public/                     # logo.jpg, promo.mp4, watermark.png
├── src/routes/
│   ├── index.tsx               # صفحة الهبوط ذهبية
│   ├── admin.tsx               # لوحة ويب
│   ├── s.$id.tsx               # مشغّل الرابط المختصر 24س
│   └── api/
│       ├── telegram.ts         # ويبهوك تليجرام
│       ├── keep.ts             # صحة + إعلانات ساعة + اختبار pause
│       ├── status.ts           # صحة JSON
│       ├── resolve.ts
│       └── file.ts
└── src/lib/
    ├── db.ts                   # PGlite | Neon + flush إلى Blob
    ├── env.server.ts
    ├── bot/                    # قلب البوت
    │   ├── config.server.ts    # الهوية، الملاك، الأعلام، الحدود
    │   ├── handle.server.ts    # كل التحديثات: أوامر، تحميل، AI، صيانة
    │   ├── telegram.server.ts  # غلاف Bot API
    │   ├── store.server.ts     # أعضاء، أكواد، كليبات، حظر، AI turns
    │   ├── settings.server.ts  # صلاحيات التحميل
    │   ├── safety.ts           # حجب أغاني/حريم/إباحي
    │   ├── grok.server.ts      # Barq AI + أدوات المالك
    │   ├── owner-panel.server.ts
    │   ├── coffee.server.ts    # فاتورة 50 نجمة
    │   ├── ads.server.ts
    │   ├── channel.server.ts   # @barq_all
    │   ├── clip-blob.server.ts
    │   ├── promo-blob.server.ts
    │   ├── watermark.server.ts
    │   ├── webhook.server.ts
    │   └── brand.ts            # توقيع + إخلاء ديني
    └── media/
        ├── extract.ts          # موزّع المنصات + yt-dlp احتياط
        ├── ytdlp.ts
        ├── http.ts             # Referer لتويتر/إنستا/تيك
        └── platforms/          # x, youtube, tiktok, instagram,
                                # facebook, reddit, vimeo, generic
""",

    "data_model": {
        "members": [
            "tg_id PK", "username", "first_name", "downloads_used",
            "subscribed_until", "is_admin", "is_banned", "created_at",
        ],
        "promo_codes": ["code PK", "days", "max_uses", "used_count", "active"],
        "download_logs": ["id", "tg_id", "url", "platform", "ok", "blocked", "reason", "verdict"],
        "payments": ["id", "tg_id", "stars", "charge_id"],
        "bot_settings": ["key PK", "value"],
        "filter_events": ["id", "tg_id", "url", "kind", "reason", "evidence"],
        "clip_links": ["id", "tg_id", "url", "media_url", "thumbnail", "kind", "platform", "expires_at"],
        "ai_turns": ["حصة Barq AI اليومية 10 لغير المالك"],
        "blob_json": ["barq-promo-codes.json", "clip blob", "barq-pglite.dump"],
    },

    "request_flow": [
        "تليجرام → POST /api/telegram → handleUpdate",
        "إن MAINTENANCE وليس مالكًا → رسالة الاعتذار والعودة",
        "إن محظور is_banned → رسالة حظر",
        "رابط → assertSafeMedia (نطاق + كلمات + Grok) → extractMedia",
        "X: vxtwitter → fxtwitter → HTML → yt-dlp",
        "deliver: جرّب sendVideoUrl ثم تنزيل+رفع (Referer لتويتر)",
        "إن فشل الإرسال → إعادة استخراج yt-dlp",
        "بعد النجاح: إخلاء ديني + بطاقة «اشغله» 24س + فاتورة قهوة 50⭐",
        "إباحي/+18 → MediaBlockedError + banUser",
        "أغاني/حريم → اعتذار بدون حظر",
        "أخيرًا flushDb() إلى Blob",
    ],

    "telegram_keyboards": {
        "user_free": [["Barq AI", "كيف يعمل"], ["اشغله", "الدعم @i_2169"]],
        "owner": "OWNER_KEYBOARD — لوحة، Barq AI، قناة، إعلان، نظام، بث…",
        "inline_after_video": [["اشغله"], ["كوب قهوة للمطور ⭐ 50"]],
        "channel_cta": "جرب البوت الآن ⚡️ → https://t.me/barq_ibot?start=try",
    },

    "owner_commands": {
        "/start": "لوحة المالك",
        "/admin /panel": "لوحة التحكم",
        "/grok": "دخول وضع Barq AI بلا حد",
        "/grant USER_ID DAYS": "منح أيام (نظام قديم، الاشتراك ملغى)",
        "/unban USER_ID": "فك حظر",
        "/broadcast TEXT": "بث",
        "/newcode CODE DAYS USES": "كود (مخفي عن المستخدم)",
        "Barq AI tools": [
            "get_stats", "list_recent_downloads", "list_blocked",
            "ban_user", "unban_user", "grant_days", "set_bot_paused",
            "set_channel", "set_setting", "create_code",
        ],
        "activatable_later": ["إلزام الانضمام لـ @barq_all", "مشاهدة إعلان لفتح البوت"],
    },

    "media_limits": {
        "telegram_upload_max": "49 MB",
        "telegram_url_max": "19 MB",
        "platforms": ["youtube", "tiktok", "instagram", "x/twitter", "facebook", "reddit", "vimeo", "generic", "direct"],
        "x_fix": "تليجرام لا يجلب twimg → نحمّل بـ Referer: https://x.com/ ونرفع الملف",
    },

    "barq_ai": {
        "public_name": "Barq AI",
        "owner_name": "Grok داخل اللوحة (يظهر Barq AI)",
        "quota": "10 رسائل/يوم لغير المالك، بلا حد للمالك",
        "can": ["تلخيص فيديو", "بحث", "شرح", "تنفيذ أوامر المالك خفيًا"],
        "silent": "إعادة محاولة التحميل تلقائيًا، ترحيب عضو جديد، شكر الداعم",
    },

    "how_to_resume": [
        "في src/lib/bot/config.server.ts ضع MAINTENANCE = false",
        "npm run build && انشر production على Vercel",
        "اختبار: أرسل رابط يوتيوب ديني/مضحك بلا موسيقى",
        "اختبار حجب: أغنية ساوند كلاود يجب أن تُرفض باعتذار",
        "اختبار حظر: رابط إباحي يحظر الحساب — فكّه بـ /unban",
        "صحة: GET /api/status و /api/keep?probe=Barq7942",
    ],

    "ops_notes": [
        "PGlite داخل Lambda يضيع بدون Blob — BLOB_READ_WRITE_TOKEN إلزامي للثبات.",
        "الكود والأعضاء يُدمجان SQL + JSON Blob لتفادي سباق cold start.",
        "اشتراكات النجوم ملغاة. الدعم = فاتورة «كوب قهوة للمطور» 50⭐.",
        "المحفظة TON أُزيلت من الواجهة.",
        "تحديثات المنتج تُنشر في @barq_all وليس في خاص البوت.",
        "Webhook مضبوط على barq-vid.vercel.app/api/telegram — لا تشغّل polling محلي معه.",
    ],
}


def pretty():
    import json
    print(json.dumps(REPORT, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    pretty()
