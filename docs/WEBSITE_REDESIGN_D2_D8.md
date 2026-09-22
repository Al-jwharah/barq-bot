# Squad D2–D8 — Website redesign report

**Branch:** `feature/website-redesign`  
**Worktree:** `/workspace/barq-feature-website`  
**Checked:** 2026-09-22 (Asia/Riyadh)  
**Scope:** Frontend-focused redesign. Bot download/X/twimg paths preserved. No `BARQ_SUBSCRIPTIONS_LIVE=true`. No secret rotate/delete. No DROP/TRUNCATE. No push to `main`. Vercel **preview only**.

## Shipped

| ID | Item | Status |
|----|------|--------|
| D2 | Live link preview (`/api/preview` + homepage card: thumbnail / duration / platform / size estimate) | Done — reuses `extractMedia` SSRF guards |
| D3 | Telegram Login Widget + My Library (`/library`, `/api/telegram-auth`) | Scaffold — gated `BARQ_TELEGRAM_LOGIN_ENABLED` (default off); ENV names proposed |
| D4 | Public leaderboard (`/leaderboard`, `/api/leaderboard`) | Done — real Postgres query behind `BARQ_LEADERBOARD_LIVE` (default off); demo rows when gated |
| D5 | Barq AI Playground on homepage (`/api/ai-playground`) | Done — real xAI call when `XAI_API_KEY` present; clear disabled state otherwise; no fake DSN |
| D6 | Platform SEO pages `/tiktok` `/youtube` `/instagram` | Done — expanded Arabic content + FAQ |
| D7 | Visual overhaul | Done — motion hero (`hero-aurora`), demo GIF (`/gifs/barq-bolt.mp4`), typography hierarchy, site nav |
| D8 | Vercel preview deploy | See preview URL below |

## Proposed ENV (owner config — do not invent secrets)

```
BARQ_LEADERBOARD_LIVE=off
BARQ_TELEGRAM_LOGIN_ENABLED=off
BARQ_TELEGRAM_LOGIN_DOMAIN=
BARQ_TELEGRAM_LOGIN_MAX_AGE_SEC=86400
# existing:
TELEGRAM_BOT_TOKEN=
BARQ_BOT_USERNAME=barq_ibot
XAI_API_KEY=
```

BotFather: `/setdomain` → preview or production host before enabling Telegram Login.

## Tests

```
npx tsx --test src/lib/media/preview.test.ts \
  src/lib/bot/leaderboard.test.ts \
  src/lib/web/telegram-login.test.ts
```

9/9 passed.

## Hard stops respected

- Did not set `BARQ_SUBSCRIPTIONS_LIVE=true`
- No secret delete/rotate
- No DROP/TRUNCATE
- Did not push `main`
- Did not `vercel --prod`

## Preview URL

https://barq-qp2sygqr5-abdulrhmaan999-4640s-projects.vercel.app

Deployed: 2026-09-22 ~18:47 Asia/Riyadh · Vercel project `barq-vid` · **not** production.

## Preview URL

https://barq-qp2sygqr5-abdulrhmaan999-4640s-projects.vercel.app

Deployed: 2026-09-22 ~18:47 Asia/Riyadh · Vercel project `barq-vid` · **preview only** (CLI suggested `--prod` as next step; we did **not** promote).
