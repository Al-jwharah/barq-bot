# Squad D1 — Site diagnosis (linked but not displaying)

**Checked:** 2026-09-22 18:32 +03 (Asia/Riyadh)  
**Branch / worktree:** `feature/site-diagnosis` @ `/workspace/barq-feature-site-d1`  
**Scope:** Diagnose only. No redesign (D2–D8). No `BARQ_SUBSCRIPTIONS_LIVE=true`. No secret rotate/delete. No DROP/TRUNCATE. No push to `main`.

## Verdict

**ROOT CAUSE of blank/non-display: NOT REPRODUCED.**

Both production hosts serve a full SSR landing page that **hydrates and paints correctly** in a real Chromium session. There is **no** missing client entry, **no** JS/CSS 404 storm, and **no** wrong-origin crash that blanks the UI.

If the original symptom was “domain linked in Vercel/DNS but site blank,” that is **not** the current production state. Domains are linked **and** displaying.

**Fix applied in D1:** none (no clear one-liner display bug). Report-first.

**D2–D8 redesign:** **MAY PROCEED** (UI/product redesign), with the dual-host / cutover caveats below. Do **not** treat D1 as evidence that the landing is broken or needs an emergency origin/client-entry patch.

---

## Live verification

### Status / cache

| Host | Result |
|------|--------|
| `https://abdulrhman.ai/` | **200** `text/html` · `cache-control: public, max-age=0, must-revalidate` · Vercel · HSTS on |
| `https://barq.abdulrhman.ai/` | **200** same |
| `https://www.abdulrhman.ai/` | **308** → `https://barq.abdulrhman.ai/` |

Evidence: `docs/diagnosis/headers.txt`

### HTML shell

- `lang="ar" dir="rtl"`, full SSR `<main>` with Arabic hero (“حمّل أي فيديو بضربة برق”), CTA to `t.me/barq_ibot`, form, footer.
- Client entry present: `<script type="module" async src="/assets/index-DMxeXGXH.js">` + modulepreloads.
- CSS: `/assets/styles-eGDT_GUm.css` (200, immutable, ~27KB). Theme tokens set (`--color-bg:#07070a`, `--color-fg:#f7f1df`) — not invisible-on-white.
- Canonical: `https://barq.abdulrhman.ai` (matches `BARQ_PUBLIC_ORIGIN` in `.env.example` / RUNBOOK).
- OG image: `https://barq.abdulrhman.ai/og.jpg` (200). Apex HTML uses apex for `og:image` host when requested on apex.

### Assets (console-equivalent)

Probed on **both** apex and `barq` (GET):

| Path | Status |
|------|--------|
| `/assets/styles-*.css`, `/assets/index-*.js`, route chunks | **200** |
| `/logo.jpg`, `/promo.mp4`, `/og.jpg`, `/favicon.svg` | **200** |
| `/__grok/icon-180.png` | **200** |
| `/__grok/manifest.webmanifest` | **GET 200** / **HEAD 404** (quirk only) |

Chromium CDP probe (`docs/diagnosis/barq.json`, `apex.json`): **`failed: []`**, **`consoleMsgs: []`**, body text full Arabic, `mainH ≈ 1261`, bg/fg colors correct. Screenshots: `barq.png`, `apex.png`.

### Health

`GET /api/health` → `status: ready`, checks database/storage/queue/worker/telegram/webhook **ok**.

### Routes note (not landing blank)

- `/`, `/legal`, `/faq`, `/youtube`, `/tiktok`, `/instagram`, `/admin`, `/account` → 200 HTML.
- `/s/:id` with invalid id → **500** with intentional error UI “الرابط غير متاح” (loader `throw new Error(...)`). Expected for bad ids; not a landing blank. Valid clip ids not exercised here.

---

## Code review (landing / origin / hydration)

| Area | Finding |
|------|---------|
| `src/routes/index.tsx` | SSR-safe loader (static bot status; avoids webhook re-register). Client hydrate + form CSR OK. Absolute `/logo.jpg`, `/promo.mp4`. |
| `src/routes/__root.tsx` | `getPublicOrigin()` / `publicUrl` for canonical + OG. Manifest still points at `/__grok/manifest.webmanifest` (Grok scaffold). |
| `src/lib/bot/origin.ts` | Public origin **only** from `BARQ_PUBLIC_ORIGIN`. Canonical redirect is **www → public origin**, not apex↔subdomain swap. |
| `server/middleware/canonical-origin.ts` | Explains www→`barq` 308 while apex stays on apex when origin is `https://barq.abdulrhman.ai`. |
| Hydration | TSR stream embeds `\0` in route ids inside `<script>` (3 null bytes). Chrome still hydrates; no blank. Not treated as the display bug. |

Docs (`PRODUCTION.md` / `RUNBOOK` §7) still say apex SSL cutover **not** done. **Observation:** apex HTTPS already returns 200 with full app as of this check — docs are **stale** relative to DNS/SSL reality. Formal cutover (flip `BARQ_PUBLIC_ORIGIN` to apex + webhook re-register) remains an **ops** step, not a display bug.

---

## What “linked but not displaying” maps to now

| Hypothesis | Result |
|------------|--------|
| Missing JS client entry / CSR-only blank | **Rejected** — SSR + module entry + successful hydrate |
| Wrong `BARQ_PUBLIC_ORIGIN` breaking assets | **Rejected** — assets are root-relative; both hosts 200 |
| CSS/theme makes content invisible | **Rejected** — dark bg + light fg; screenshot shows UI |
| Domain linked but no cert / no response | **Rejected** — HTTPS 200 + HSTS on apex and barq |
| Share link `/s/:id` “linked” but empty | **Partial** — invalid ids show error UI with HTTP 500; not landing |
| Manifest HEAD 404 | **Minor** — does not blank the page |

**Most accurate current statement:** hosts are linked **and** displaying. Dual-host branding (working origin = `barq.abdulrhman.ai`; apex also live; www → barq) can feel “wrong” or unfinished vs docs, but it is not a non-display failure.

---

## Hard stops respected

- Did not set `BARQ_SUBSCRIPTIONS_LIVE=true`
- No secret delete/rotate
- No DROP/TRUNCATE migrations
- Did not push `main` (branch only: `feature/site-diagnosis`)

## D2–D8 gate

**YES — D2–D8 may proceed** (redesign/product work).  
Do not start from a “fix blank landing” premise. Prefer redesign on `feature/*` branches; keep `BARQ_PUBLIC_ORIGIN=https://barq.abdulrhman.ai` until an explicit cutover checklist is run.
