# Universal video downloads (any site)

Pipeline (`src/lib/media/universal.server.ts`), used when the fast direct-URL path fails:

1. yt-dlp on the link itself (≈1800 sites + generic extractor), onedir build unpacked once per instance.
2. Page standards: og:video, twitter:player, `<video>/<source>`, player `<iframe>`, oEmbed, JSON-LD
   VideoObject, `.mp4/.m3u8/.mpd` strings in scripts → each candidate handed to yt-dlp with Referer.
3. Grok (`XAI_API_KEY`) picks the main video among URLs that really exist in the page (index only; it cannot invent URLs).
4. Telegram fit: single file ≤ 49 MB preferred (≤480p when sizes are unknown); otherwise a fast stream-copy split into parts (max 6).

Guards kept: SSRF on every target, porn/CSAM/music policy on the page and on every media target, per-instance
limit of 2 parallel universal jobs, /tmp free-space check (Vercel /tmp is 512 MB shared).

## Sites that block cloud IPs (YouTube, Reddit, Cloudflare-protected news)

Vercel runs on AWS IPs. YouTube answers "Sign in to confirm you're not a bot", Reddit requires login, and some
news sites return a Cloudflare challenge. Optional owner settings (never logged):

- `YTDLP_PROXY` — residential/ISP proxy URL (`http://user:pass@host:port` or `socks5://…`). Most reliable fix.
- `YTDLP_COOKIES_B64` — base64 of a Netscape `cookies.txt` exported from a throwaway logged-in account.

Set in Vercel (Production + Preview) and redeploy.

## Free fallbacks for bot-walled pages (no signup, no keys)

`src/lib/media/page-sources.server.ts` reads a page in this order, stopping as soon as media is found:

1. Direct fetch (browser UA).
2. Direct fetch as a chat-preview crawler (`TelegramBot (like TwitterBot)`).
3. Public chat-preview mirrors (Reddit → `vxreddit.com`, `rxddit.com`, same path). The
   `v.redd.it/<id>/HLSPlaylist.m3u8` master (audio + video) is ranked first.
4. Jina Reader (`r.jina.ai`, free anonymous tier, rate limited).

Mirrors and the reader carry in-memory health: 3 failures → 10-minute cooldown, then retried.
Every media target still passes the SSRF guard and the porn/music policy (`guard`).
The Grok pick runs once, after all sources, on the first readable page.
yt-dlp retries once with `generic:impersonate` on a Cloudflare JS challenge.

Evaluated and rejected (2026-09-30, from Vercel fra1): public Cobalt instances (need Turnstile JWT /
API keys or Cloudflare-blocked), Invidious/Piped (API off, down, or bot-checked), all yt-dlp YouTube
player clients (IP-level "confirm you're not a bot"), loader.to-style APIs (ToS requires paid API).
YouTube from Vercel needs a residential IP (run `src/worker` on a home machine) or `YTDLP_PROXY` /
`YTDLP_COOKIES_B64`.

## Owner feature flags (owner panel → «الميزات»)

Stored in `bot_settings` as `ff_<name>` (`on`/`off`); unset = default below.

| Flag | Default | What it does |
|---|---|---|
| `ff_quality` | env `BARQ_QUALITY_PICKER` (off) | Quality picker before delivery (360–1080 / audio). |
| `ff_audio` | off | After a video: «صوت فقط 🎵» (MP3) and «رسالة صوتية 🎙» (OGG/Opus voice note). Only offered for media that already passed the music/porn filter. |
| `ff_trim` | off | Trim the last video from chat: `من 1:20 إلى 2:05` (Arabic digits ok, ≤ 3 min). |
| `ff_post_ai` | env `BARQ_POST_DELIVERY_AI` (off) | Grok row after each file: summary · caption · translate. |
| `ff_batch` | on | Several links in one message (3 free / 5 premium). Off = first link only. |
| `ff_inline` | off | `@bot <link>` in any chat: re-sends an already-delivered (cached) video, or an "open Barq" card. Also needs BotFather → /setinline. |
| `ff_owner_report` | on | Daily numbers to the owner only (`BARQ_OWNER_TG_ID`), from the daily `/api/keep` cron, at most once per 20h. «معاينة التقرير» in the panel shows it without sending. |
