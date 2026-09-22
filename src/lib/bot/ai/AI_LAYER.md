# Barq AI layer (`feature/ai-layer`)

Shipped on branch `feature/ai-layer` from wip snapshot. No production deploy. Subscriptions stay off on prod. No secret rotate/delete. No DROP/TRUNCATE. Worker Docker files untouched.

## Shipped

| ID | Feature | Status |
|----|---------|--------|
| **A5** | Free-text → xAI routing | **Live**: `decideAiRoute` skips UI chrome; `/ai <prompt>` chats immediately; entry copy says ready. |
| **A1** | Auto-summarize «لخّصه» | **MVP**: post-download button `ai:sum` → Arabic 2–3 sentence summary via xAI. Optional Whisper via proposed ENV only. |
| **A2** | Smart captions | **MVP**: tones فصحى/خليجي/مصري + copy block. |
| **A3** | Smart Clips v1 | **Basic**: videos ≥90s; heuristic windows + optional ffmpeg silencedetect energy. Suggestions only (no auto-cut burn). |
| **A4** | Auto-subtitles | **Opt-in scaffold**: toggle + SRT draft from title; burn-in deferred (`BARQ_AI_SUBTITLES_BURN`). |

## Proposed ENV (names only — do not commit secrets)

- `BARQ_AI_TRANSCRIBE` / `BARQ_WHISPER_URL` / `BARQ_WHISPER_API_KEY`
- `BARQ_AI_SUBTITLES` / `BARQ_AI_SUBTITLES_BURN`
- Existing: `XAI_API_KEY`, `BARQ_AI_ENABLED`, `BARQ_AI_DAILY`

## Deferred

- Full Whisper transcription in production (needs provider + quota)
- Subtitle burn-in into video (heavy ffmpeg on worker)
- Smart Clips auto-export of cut files to Telegram
- Preview deploy / Vercel promotion

## Tests

`npm run test:ai` — route, summarize, captions, smart-clips, subtitles, post-delivery, router.
