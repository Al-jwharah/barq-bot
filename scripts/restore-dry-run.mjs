#!/usr/bin/env node
/**
 * Safe restore proof helper.
 *
 * - Never writes to production DATABASE_URL.
 * - If RESTORE_DATABASE_URL is set and differs from DATABASE_URL: migrate + upsert
 *   a fixture (or --snapshot path) into that second database.
 * - If unset: run an in-process PGLite restore when @electric-sql/pglite is
 *   available, and always refresh RESTORE_PROOF.md with owner steps.
 *
 * Usage:
 *   node scripts/restore-dry-run.mjs
 *   node scripts/restore-dry-run.mjs --snapshot /path/to/snapshot.json
 *   RESTORE_DATABASE_URL=postgres://… node scripts/restore-dry-run.mjs
 *
 * Prints counts only. Never prints connection strings or snapshot payloads.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pendingMigrations } from "./migration-plan.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const require = createRequire(import.meta.url);

function readUrl(name) {
  const raw = process.env[name];
  return raw && String(raw).trim() ? String(raw).trim() : "";
}

function normalizeDbUrl(url) {
  try {
    const u = new URL(url.replace(/^postgres:/i, "postgresql:"));
    u.search = "";
    u.hash = "";
    // drop password for equality compare only — never print
    const user = u.username;
    const host = u.host;
    const path = u.pathname;
    return `${u.protocol}//${user}@${host}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function fixtureSnapshot() {
  const day = new Date().toISOString().slice(0, 10);
  return {
    at: new Date().toISOString(),
    settings: { restore_dry_run: "1", bot_paused: "off" },
    codes: [{ code: "BRQDRY01", days: 7, max_uses: 3, used_count: 1, active: true }],
    members: [
      {
        tg_id: "10001",
        username: "restore_probe",
        role: "user",
        tier: "free",
        is_banned: false,
        downloads_used: 2,
      },
    ],
    usage: [{ user_id: "10001", day, action: "download", count: 2 }],
    bans: [
      {
        id: "ban-10002-dry",
        user_id: "10002",
        reason: "dry-run",
        category: "manual",
        status: "active",
      },
    ],
    tickets: [
      {
        id: "BRQ-DRYRUN",
        user_id: "10001",
        message: "dry-run ticket",
        status: "open",
      },
    ],
    clips: [
      {
        id: "clipdry01",
        tg_id: "10001",
        url: "https://example.com/v",
        media_url: null,
        storage_key: null,
        hits: 0,
      },
    ],
    jobs: [
      {
        id: "job-dry-1",
        tg_id: "10001",
        chat_id: "10001",
        url: "https://example.com/v",
        status: "pending",
        attempts: 0,
        max_attempts: 3,
        job_key: "dry-key-1",
      },
      {
        id: "job-dry-2",
        tg_id: "10001",
        chat_id: "10001",
        url: "https://example.com/done",
        status: "completed",
        attempts: 1,
        max_attempts: 3,
      },
    ],
  };
}

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function snapshotShape(snap) {
  const errors = [];
  if (!isRecord(snap)) return { ok: false, errors: ["snapshot"] };
  if (snap.settings !== undefined) {
    if (!isRecord(snap.settings) || Object.values(snap.settings).some((v) => typeof v !== "string")) {
      errors.push("settings");
    }
  }
  for (const [key, need] of [
    ["codes", (c) => isRecord(c) && typeof c.code === "string"],
    ["members", (m) => isRecord(m) && (typeof m.tg_id === "string" || typeof m.tg_id === "number")],
    ["usage", (u) => isRecord(u) && typeof u.user_id === "string" && typeof u.action === "string"],
    ["bans", (b) => isRecord(b) && typeof b.id === "string" && typeof b.user_id === "string"],
    ["tickets", (t) => isRecord(t) && typeof t.id === "string" && typeof t.user_id === "string"],
    ["clips", (c) => isRecord(c) && typeof c.id === "string" && typeof c.tg_id === "string"],
    ["jobs", (j) => isRecord(j) && typeof j.id === "string" && typeof j.tg_id === "string" && typeof j.chat_id === "string"],
  ]) {
    const v = snap[key];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.some((row) => !need(row))) errors.push(key);
  }
  return { ok: errors.length === 0, errors };
}

async function loadSnapshot(argv) {
  const idx = argv.indexOf("--snapshot");
  if (idx >= 0 && argv[idx + 1]) {
    const raw = await readFile(resolve(argv[idx + 1]), "utf8");
    return JSON.parse(raw);
  }
  return fixtureSnapshot();
}

async function migrateWithPg(client) {
  const migrationsDir = join(root, "migrations");
  const entries = await readdir(migrationsDir);
  await client.query(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const applied = (await client.query("SELECT name FROM _migrations")).rows.map((r) => r.name);
  let count = 0;
  for (const { name } of pendingMigrations(entries, applied)) {
    const text = await readFile(join(migrationsDir, name), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(text);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      count += 1;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
  }
  return count;
}

async function applyWithPglite(snap) {
  let PGlite;
  try {
    ({ PGlite } = await import("@electric-sql/pglite"));
  } catch {
    return { ok: false, reason: "pglite_unavailable" };
  }
  const pg = new PGlite();
  await pg.waitReady;
  const migrationsDir = join(root, "migrations");
  const entries = await readdir(migrationsDir);
  await pg.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const appliedRows = await pg.query("SELECT name FROM _migrations");
  const applied = appliedRows.rows.map((r) => r.name);
  for (const { name } of pendingMigrations(entries, applied)) {
    const text = await readFile(join(migrationsDir, name), "utf8");
    await pg.exec(text);
    await pg.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
  }

  // Minimal tagged-template adapter for applyRestoreSnapshot logic via dynamic import
  // after pointing DATABASE_URL away and using a custom path: call SQL directly here
  // to avoid loading Neon pool against empty env.
  const counts = {
    settings: 0,
    codes: 0,
    members: 0,
    usage: 0,
    bans: 0,
    tickets: 0,
    clips: 0,
    jobs: 0,
  };

  for (const [k, v] of Object.entries(snap.settings || {})) {
    await pg.query(
      `insert into bot_settings (key, value) values ($1, $2)
       on conflict (key) do update set value = excluded.value`,
      [k, v],
    );
    counts.settings += 1;
  }
  for (const m of snap.members || []) {
    await pg.query(
      `insert into members (tg_id, username, role, tier, is_banned, downloads_used)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (tg_id) do update set role = excluded.role, tier = excluded.tier, is_banned = excluded.is_banned`,
      [String(m.tg_id), m.username ?? null, m.role ?? "user", m.tier ?? "free", Boolean(m.is_banned), Number(m.downloads_used ?? 0)],
    );
    counts.members += 1;
  }
  for (const c of snap.codes || []) {
    await pg.query(
      `insert into promo_codes (code, days, max_uses, used_count, active)
       values ($1,$2,$3,$4,$5)
       on conflict (code) do update set days = excluded.days, max_uses = excluded.max_uses, used_count = excluded.used_count, active = excluded.active`,
      [String(c.code).toUpperCase(), Number(c.days) || 30, Number(c.max_uses) || 20, Number(c.used_count) || 0, Boolean(c.active)],
    );
    counts.codes += 1;
  }
  for (const u of snap.usage || []) {
    await pg.query(
      `insert into usage_counters (user_id, day, action, count)
       values ($1,$2::date,$3,$4)
       on conflict (user_id, day, action) do update set count = excluded.count`,
      [u.user_id, u.day, u.action, u.count],
    );
    counts.usage += 1;
  }
  for (const b of snap.bans || []) {
    await pg.query(
      `insert into bans (id, user_id, reason, category, status)
       values ($1,$2,$3,$4,$5)
       on conflict (id) do update set status = excluded.status, reason = excluded.reason`,
      [b.id, b.user_id, b.reason ?? null, b.category ?? null, b.status ?? "active"],
    );
    counts.bans += 1;
  }
  for (const t of snap.tickets || []) {
    await pg.query(
      `insert into support_tickets (id, user_id, message, status)
       values ($1,$2,$3,$4)
       on conflict (id) do update set message = excluded.message, status = excluded.status`,
      [t.id, t.user_id, t.message ?? "", t.status ?? "open"],
    );
    counts.tickets += 1;
  }
  for (const c of snap.clips || []) {
    await pg.query(
      `insert into clip_links (id, tg_id, url, hits)
       values ($1,$2,$3,$4)
       on conflict (id) do update set url = excluded.url, hits = excluded.hits`,
      [c.id, c.tg_id, c.url ?? "", Number(c.hits ?? 0)],
    );
    counts.clips += 1;
  }
  for (const j of snap.jobs || []) {
    const active = new Set(["pending", "processing", "uploading"]);
    const status = active.has(String(j.status)) ? "cancelled" : String(j.status ?? "cancelled");
    await pg.query(
      `insert into download_jobs (id, tg_id, chat_id, url, status, attempts, max_attempts, error_code)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do update set status = excluded.status, error_code = excluded.error_code`,
      [
        j.id,
        j.tg_id,
        j.chat_id,
        j.url ?? "",
        status,
        Number(j.attempts ?? 0),
        Number(j.max_attempts ?? 3),
        active.has(String(j.status)) ? "restored_from_backup" : j.error_code ?? null,
      ],
    );
    counts.jobs += 1;
  }

  const jobStatus = await pg.query(`select status from download_jobs where id = $1`, ["job-dry-1"]);
  const coerced = jobStatus.rows[0]?.status === "cancelled";
  await pg.close?.();
  return { ok: true, counts, coercedActiveJob: coerced };
}

async function applyWithRestoreUrl(snap, restoreUrl) {
  let pg;
  try {
    pg = require("pg");
  } catch {
    return { ok: false, reason: "pg_unavailable" };
  }
  const pool = new pg.Pool({ connectionString: restoreUrl, max: 1 });
  const client = await pool.connect();
  try {
    const migrated = await migrateWithPg(client);
    // Use parameterized upserts mirroring store (counts only returned)
    const counts = {
      settings: 0,
      codes: 0,
      members: 0,
      usage: 0,
      bans: 0,
      tickets: 0,
      clips: 0,
      jobs: 0,
    };
    await client.query("BEGIN");
    try {
      for (const [k, v] of Object.entries(snap.settings || {})) {
        await client.query(
          `insert into bot_settings (key, value) values ($1,$2) on conflict (key) do update set value = excluded.value`,
          [k, v],
        );
        counts.settings += 1;
      }
      for (const m of snap.members || []) {
        await client.query(
          `insert into members (tg_id, username, role, tier, is_banned, downloads_used)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (tg_id) do update set role = excluded.role, tier = excluded.tier, is_banned = excluded.is_banned`,
          [String(m.tg_id), m.username ?? null, m.role ?? "user", m.tier ?? "free", Boolean(m.is_banned), Number(m.downloads_used ?? 0)],
        );
        counts.members += 1;
      }
      for (const c of snap.codes || []) {
        await client.query(
          `insert into promo_codes (code, days, max_uses, used_count, active)
           values ($1,$2,$3,$4,$5)
           on conflict (code) do update set days = excluded.days, max_uses = excluded.max_uses, used_count = excluded.used_count, active = excluded.active`,
          [String(c.code).toUpperCase(), Number(c.days) || 30, Number(c.max_uses) || 20, Number(c.used_count) || 0, Boolean(c.active)],
        );
        counts.codes += 1;
      }
      for (const u of snap.usage || []) {
        await client.query(
          `insert into usage_counters (user_id, day, action, count) values ($1,$2::date,$3,$4)
           on conflict (user_id, day, action) do update set count = excluded.count`,
          [u.user_id, u.day, u.action, u.count],
        );
        counts.usage += 1;
      }
      for (const b of snap.bans || []) {
        await client.query(
          `insert into bans (id, user_id, reason, category, status) values ($1,$2,$3,$4,$5)
           on conflict (id) do update set status = excluded.status`,
          [b.id, b.user_id, b.reason ?? null, b.category ?? null, b.status ?? "active"],
        );
        counts.bans += 1;
      }
      for (const t of snap.tickets || []) {
        await client.query(
          `insert into support_tickets (id, user_id, message, status) values ($1,$2,$3,$4)
           on conflict (id) do update set message = excluded.message, status = excluded.status`,
          [t.id, t.user_id, t.message ?? "", t.status ?? "open"],
        );
        counts.tickets += 1;
      }
      for (const c of snap.clips || []) {
        await client.query(
          `insert into clip_links (id, tg_id, url, hits) values ($1,$2,$3,$4)
           on conflict (id) do update set url = excluded.url`,
          [c.id, c.tg_id, c.url ?? "", Number(c.hits ?? 0)],
        );
        counts.clips += 1;
      }
      for (const j of snap.jobs || []) {
        const active = new Set(["pending", "processing", "uploading"]);
        const status = active.has(String(j.status)) ? "cancelled" : String(j.status ?? "cancelled");
        await client.query(
          `insert into download_jobs (id, tg_id, chat_id, url, status, attempts, max_attempts, error_code)
           values ($1,$2,$3,$4,$5,$6,$7,$8)
           on conflict (id) do update set status = excluded.status, error_code = excluded.error_code, worker_id = null, last_heartbeat_at = null, retry_at = null`,
          [
            j.id,
            j.tg_id,
            j.chat_id,
            j.url ?? "",
            status,
            Number(j.attempts ?? 0),
            Number(j.max_attempts ?? 3),
            active.has(String(j.status)) ? "restored_from_backup" : j.error_code ?? null,
          ],
        );
        counts.jobs += 1;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    return { ok: true, counts, migrated };
  } finally {
    client.release();
    await pool.end();
  }
}

function proofMarkdown({ mode, localOk, counts, notes }) {
  const now = new Date().toISOString();
  return `# Restore proof — برق ⚡️

**Date (UTC):** ${now}
**Local automated mode:** \`${mode}\`
**Local automated result:** ${localOk ? "PASS (fixture / shape)" : "PARTIAL / NOT RUN"}

## Coverage now (code)

Upsert restore (no table truncate) includes:

| Bucket | Backup dump | Restore upsert |
|--------|-------------|----------------|
| bot_settings | yes | yes |
| members | yes (all rows) | yes |
| promo_codes | yes | **yes (was missing before)** |
| usage_counters | yes | yes |
| bans | **yes (new)** | **yes (new)** |
| support_tickets | **yes (new)** | **yes (new)** |
| clip_links metadata | **yes (new)** | **yes (new)** — blob bytes not copied |
| download_jobs metadata | **yes (new, cap 5000)** | **yes (new)** — active statuses coerced to \`cancelled\` |

## What this script did locally

${counts ? `- Counts written: ${JSON.stringify(counts)}` : "- No DB writes (dependency or URL missing)."}
${notes.map((n) => `- ${n}`).join("\n")}

## Owner steps — prove against a SECOND database (required for PROVEN)

Do **not** point these steps at production \`DATABASE_URL\`.

1. Create a separate Neon/Supabase/Postgres database (empty clone is fine).
2. Set \`RESTORE_DATABASE_URL\` in a local shell only (never commit it). Confirm it is **not** the production URL.
3. Dump production via admin session:
   \`\`\`bash
   curl -sS -b cookies.txt "$BARQ_PUBLIC_ORIGIN/api/backup" -o snapshot.json
   \`\`\`
4. Run:
   \`\`\`bash
   RESTORE_DATABASE_URL='…second db…' node scripts/restore-dry-run.mjs --snapshot snapshot.json
   \`\`\`
5. Compare row counts on the second DB for settings/members/codes/usage/bans/tickets/clips/jobs.
6. Optionally boot a preview with \`DATABASE_URL\`=\`RESTORE_DATABASE_URL\` (preview only) and hit \`/api/health\`.
7. Record pass/fail in \`RESTORE_TEST_REPORT.md\`. Until step 4–6 succeed on a live second DB, keep verdict **NOT PROVEN**.

## Safety locks

- Script refuses when \`RESTORE_DATABASE_URL\` normalizes equal to \`DATABASE_URL\`.
- Production \`DATABASE_URL\` is never used as the restore target by this script.
- \`POST /api/backup\` with \`confirm: RESTORE\` still upserts the **current** app DB — use only with intent; prefer \`confirm: TEST\` first.
- Snapshot JSON must stay off git and out of chat logs.
`;
}

async function main() {
  const prod = readUrl("DATABASE_URL") || readUrl("POSTGRES_URL");
  const restore = readUrl("RESTORE_DATABASE_URL");
  const snap = await loadSnapshot(process.argv);
  const shape = snapshotShape(snap);
  if (!shape.ok) {
    console.error("[restore-dry-run] invalid snapshot shape:", shape.errors.join(","));
    process.exit(1);
  }
  console.log("[restore-dry-run] snapshot shape ok");

  let mode = "shape-only";
  let localOk = false;
  let counts = null;
  const notes = [];

  if (restore) {
    if (prod && normalizeDbUrl(restore) === normalizeDbUrl(prod)) {
      console.error("[restore-dry-run] REFUSING: RESTORE_DATABASE_URL matches DATABASE_URL");
      notes.push("Refused restore — RESTORE_DATABASE_URL equals DATABASE_URL.");
      await writeFile(join(root, "RESTORE_PROOF.md"), proofMarkdown({ mode: "refused-same-url", localOk: false, counts: null, notes }), "utf8");
      process.exit(2);
    }
    try {
      const result = await applyWithRestoreUrl(snap, restore);
      if (!result.ok) {
        notes.push(`RESTORE_DATABASE_URL set but apply failed: ${result.reason}`);
      } else {
        mode = "restore-database-url";
        localOk = true;
        counts = result.counts;
        notes.push(`Migrated ${result.migrated} pending file(s) on RESTORE_DATABASE_URL.`);
        notes.push("Upsert restore applied to second database (counts only logged).");
        console.log("[restore-dry-run] second-db restore ok", JSON.stringify(result.counts));
      }
    } catch (err) {
      notes.push(`RESTORE_DATABASE_URL apply error: ${err?.message || "error"}`);
      console.error("[restore-dry-run] second-db restore failed:", err?.message || err);
    }
  } else {
    notes.push("RESTORE_DATABASE_URL unset — skipped second-database restore.");
    try {
      const result = await applyWithPglite(snap);
      if (result.ok) {
        mode = "pglite-temp";
        localOk = true;
        counts = result.counts;
        notes.push("Applied fixture into temporary PGLite and verified upserts.");
        if (result.coercedActiveJob) notes.push("Active job status coerced to cancelled on restore.");
        console.log("[restore-dry-run] pglite restore ok", JSON.stringify(result.counts));
      } else {
        notes.push(`PGLite path skipped: ${result.reason}. Run npm install, then re-run.`);
        console.log("[restore-dry-run] pglite unavailable — wrote owner steps only");
      }
    } catch (err) {
      notes.push(`PGLite apply error: ${err?.message || "error"}`);
      console.error("[restore-dry-run] pglite failed:", err?.message || err);
    }
  }

  await writeFile(join(root, "RESTORE_PROOF.md"), proofMarkdown({ mode, localOk, counts, notes }), "utf8");
  console.log("[restore-dry-run] wrote RESTORE_PROOF.md");
  if (!localOk && !restore) process.exitCode = 0; // proof doc still valuable
}

main().catch((err) => {
  console.error("[restore-dry-run] fatal:", err?.message || err);
  process.exit(1);
});
