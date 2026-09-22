# Website product v2

**Branch:** `feature/website-product-v2`  
**Worktree:** `/workspace/barq-website-v2`  
**Base:** `preview/unified-mandate`  
**Checked:** 2026-09-22 (Asia/Riyadh)

## Shipped

1. **Hero fix** — removed `aspect-[9/14] + max-h` shrink that left a black RTL left gutter on mobile. Full-width `h-[min(72vw,26rem)]` + `object-cover object-center` for 720×1280 promo.
2. **Platform positioning** — homepage sells downloads + برق AI + library + roadmap (not paste-link only).
3. **Auth** — `/login` + `/register` (Telegram Login Widget + email/password scaffold). Library stays behind Telegram auth.
4. **Ads** — `AdSlot` + `/api/ads`, flag `BARQ_ADS_ENABLED` default **off**; demo creatives labeled «إعلان تجريبي».
5. **Pricing** — `/pricing` Plus/Pro/Max/Season from `plans.ts`, CTA deep-links `t.me/barq_ibot?start=sub_*`. UI via `BARQ_SUBSCRIPTIONS_UI` (default on). **Never** flips `BARQ_SUBSCRIPTIONS_LIVE`.
6. **برق AI branding** — UI strings/admin labels/model meta no longer say Grok/xAI to end users.
7. **Nav** — fewer primary pills; mobile hamburger menu.

## Proposed ENV (owner only — do not invent secrets)

```
BARQ_ADS_ENABLED=off
BARQ_SUBSCRIPTIONS_UI=on
BARQ_SUBSCRIPTIONS_LIVE=off
BARQ_LEADERBOARD_LIVE=off
BARQ_REFERRALS_LIVE=off
BARQ_TELEGRAM_LOGIN_ENABLED=off
BARQ_TELEGRAM_LOGIN_DOMAIN=
BARQ_TELEGRAM_LOGIN_MAX_AGE_SEC=86400
BARQ_EMAIL_AUTH_ENABLED=off
BARQ_AUTH_SECRET=
TELEGRAM_BOT_TOKEN=
BARQ_BOT_USERNAME=barq_ibot
XAI_API_KEY=
```

## Hard stops

- No push to `main`
- No `vercel --prod`
- Did not set BARQ_SUBSCRIPTIONS_LIVE / LEADERBOARD_LIVE / REFERRALS_LIVE true on production
- No secret delete/rotate; no DROP/TRUNCATE


## Preview URL

https://barq-p000vhuq5-abdulrhmaan999-4640s-projects.vercel.app

Deployed: 2026-09-22 ~19:18 Asia/Riyadh · Vercel project `barq-vid` · **preview only** (target=null, not production).

Smoke: `/` `/pricing` `/login` `/register` `/api/ads` `/api/pricing-flags` → 200.
Flags observed: `BARQ_SUBSCRIPTIONS_LIVE=false`, `BARQ_ADS_ENABLED=false`, `BARQ_SUBSCRIPTIONS_UI=true`.


## Owner mandate (2026-09-22) — payment deferred

- `BARQ_SUBSCRIPTIONS_UI=on` — show pricing / plans / Telegram deep-links / gating.
- `BARQ_SUBSCRIPTIONS_LIVE=off` — **do not** charge, send Stars invoices, or approve `pre_checkout`.
- Free tier: **10 downloads / Riyadh day** (`BARQ_FREE_DOWNLOADS=10`, `BARQ_DAILY_CAP=10`).
- Default AI model id (internal): `grok-4.5` — user-facing brand only «برق AI».
