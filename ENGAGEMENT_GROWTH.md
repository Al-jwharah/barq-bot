# Squad B — Engagement & Growth (`feature/engagement-growth`)

## Hard stops (honored)
- Never set `BARQ_SUBSCRIPTIONS_LIVE=true` from this branch.
- No secret delete/rotate, no DROP/TRUNCATE.
- Never push `main`. No production deploy from this work.
- Preserve X / twimg / fx / 50MB cloud upload behavior (untouched).

## Live gates (default OFF)
| Flag | Default | Purpose |
|------|---------|---------|
| `BARQ_REFERRALS_LIVE` | **off** | B3 invite link + points awards |
| `BARQ_LEADERBOARD_LIVE` | **off** | B4 weekly leaderboard bot cmd + `/api/leaderboard` |

**Owner mandate:** B3/B4 must not go live until Squad C reports **48h with no new failures**.

When gated:
- `/invite`, `/ref`, `دعوة`, `/start ref_*` → gated Arabic message (no rewards).
- `applyReferral` no-ops when flag off.
- `/top`, `/leaderboard`, `المتصدرين` → gated message; API returns HTTP 503 `{ live: false }`.

## Shipped (live path OK)
| ID | Feature | Notes |
|----|---------|-------|
| **B1** | Batch download progress card | `🟢🟢🟡⚪⚪` via `batchProgressCard` / `multiLinkProgressText`; enqueue edits status |
| **B2** | My Library | Postgres last 25 (cap 30); `سجلي` / `مكتبتي` / `/library` |
| **B5** | Daily-limit warn at #4/5 | `shouldWarnDailyLimit`; fired from `bumpDownloadOk(chatId)` |
| **B6** | Streaks in رحلتك | Consecutive-day counter on journey list header |

## Built but gated
| ID | Feature | Enable after |
|----|---------|--------------|
| **B3** | Referral invite + points | Squad C 48h + flip `BARQ_REFERRALS_LIVE=on` |
| **B4** | Weekly leaderboard + API | Squad C 48h + flip `BARQ_LEADERBOARD_LIVE=on` |

## Worktree
- Path: `/workspace/barq-feature-growth`
- Branch: `feature/engagement-growth`
- Avoids Docker / always-on worker file edits beyond passing `chatId` into `bumpDownloadOk`.
- Avoids clobbering `feature/ai-layer` Grok work.

## Tests
```bash
npx tsx --test src/lib/bot/engagement.test.ts src/lib/bot/leaderboard.test.ts src/lib/bot/handle-guards.test.ts src/lib/bot/flags.test.ts src/lib/bot/growth.test.ts src/lib/bot/library.test.ts
```
