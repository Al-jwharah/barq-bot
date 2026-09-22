# برق AI layer (`feature/barq-ai-v2`)

Competitive core for Barq v2. Brand in UI: **«برق AI»** only (never Grok/xAI/جروك). Silent router aliases kept for compat. Subscriptions stay off on prod. No secret rotate/delete. No DROP/TRUNCATE.

## Status (v2)

| ID | Feature | Status |
|----|---------|--------|
| **A5** | Free-text chat | **REAL**: `decideAiRoute` + `askBarqAI` live model. Missing key → loud Arabic. |
| **A1** | لخّصه | **REAL**: post-download `ai:sum` → Arabic 2–3 sentences from title/description (+ optional Whisper ENV). |
| **A2** | كابشن | **REAL**: tones فصحى/خليجي/مصري + copy block from title/description. |
| **A3** | مقاطع ذكية | **BASIC**: ≥90s heuristic/ffmpeg windows (suggestions only). |
| **A4** | ترجمة | **REAL draft**: opt-in + live model Arabic lines → SRT scaffold; burn deferred. |
| **Analyze** | حلّل | **REAL**: model analysis from title/description. |
| **Studio** | للنشر | **REAL**: multi-platform publish pack from title/description. |

## Hard rules

- Missing `XAI_API_KEY` → clear Arabic (`AI_MISSING_KEY_AR`) — never soft «يتهيأ».
- Enrich from extract `text`/description — do not invent video scenes.
- User copy = «برق AI» only.

## Proposed ENV (names only)

- `BARQ_AI_TRANSCRIBE` / `BARQ_WHISPER_URL` / `BARQ_WHISPER_API_KEY`
- `BARQ_AI_SUBTITLES` / `BARQ_AI_SUBTITLES_BURN`
- Existing: `XAI_API_KEY`, `BARQ_AI_ENABLED`, `BARQ_AI_DAILY`

## Tests

`npm run test:ai` — route, summarize, captions, smart-clips, subtitles, post-delivery, copy, router.
