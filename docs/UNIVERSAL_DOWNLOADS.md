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
