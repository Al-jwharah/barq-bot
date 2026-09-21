#!/usr/bin/env node
/**
 * Copy a local PGlite data-dir dump (`dumpDataDir("gzip")` / `barq-pglite.dump`)
 * into DATABASE_URL Postgres.
 *
 *   node scripts/migrate-pglite-dump.mjs [--dry-run] [dump-path]
 *   PGLITE_DUMP_PATH=./barq-pglite.dump node scripts/migrate-pglite-dump.mjs
 *
 * Prints COUNTS only (table, source_rows, inserted, skipped). Never prints row
 * contents, tokens, or connection strings. Idempotent: ON CONFLICT either does
 * nothing or updates only when the dump row is strictly newer than Postgres.
 *
 * Production blob `barq-pglite.dump` is NOT fetched here — pass a local file.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Tables the dump is allowed to copy. Unknown dump columns are ignored. */
export const TABLES = [
  {
    name: "members",
    pk: ["tg_id"],
    conflict: "update-if-newer",
    newer: ["last_active", "created_at"],
    greatest: ["downloads_used"],
    columns: [
      "tg_id",
      "username",
      "first_name",
      "downloads_used",
      "subscribed_until",
      "is_admin",
      "created_at",
      "channel_ok",
      "is_banned",
      "role",
      "tier",
      "daily_limit",
      "last_active",
    ],
  },
  {
    name: "bot_settings",
    pk: ["key"],
    conflict: "update-if-newer",
    newer: ["updated_at"],
    columns: ["key", "value", "updated_at"],
  },
  {
    name: "promo_codes",
    pk: ["code"],
    conflict: "update-if-newer",
    newer: ["created_at"],
    greatest: ["used_count"],
    columns: ["code", "days", "max_uses", "used_count", "active", "created_at"],
  },
  {
    name: "bans",
    pk: ["id"],
    conflict: "update-if-newer",
    newer: ["updated_at", "created_at"],
    columns: [
      "id",
      "user_id",
      "reason",
      "category",
      "created_by",
      "created_at",
      "expires_at",
      "status",
      "appeal_status",
      "appeal_text",
      "updated_at",
    ],
  },
  {
    name: "support_tickets",
    pk: ["id"],
    conflict: "update-if-newer",
    newer: ["updated_at", "created_at"],
    columns: [
      "id",
      "user_id",
      "job_id",
      "subject",
      "message",
      "status",
      "assigned_to",
      "error_code",
      "created_at",
      "updated_at",
      "resolved_at",
    ],
  },
  {
    name: "download_jobs",
    pk: ["id"],
    conflict: "update-if-newer",
    newer: ["finished_at", "started_at", "last_heartbeat_at", "created_at"],
    columns: [
      "id",
      "tg_id",
      "chat_id",
      "url",
      "platform",
      "status",
      "attempts",
      "max_attempts",
      "status_message_id",
      "error",
      "created_at",
      "started_at",
      "finished_at",
      "update_id",
      "job_key",
      "quota_applied",
      "completed_at",
      "failed_at",
      "cancelled_at",
      "expired_at",
      "error_code",
      "error_message_safe",
      "retry_at",
      "worker_id",
      "last_heartbeat_at",
      "request_id",
    ],
  },
  {
    name: "clip_links",
    pk: ["id"],
    conflict: "update-if-newer",
    newer: ["created_at"],
    greatest: ["hits"],
    columns: [
      "id",
      "tg_id",
      "url",
      "media_url",
      "thumbnail",
      "kind",
      "platform",
      "created_at",
      "expires_at",
      "storage_key",
      "hits",
      "max_hits",
      "revoked_at",
    ],
  },
  {
    name: "user_feedback",
    pk: ["id"],
    conflict: "nothing",
    columns: ["id", "tg_id", "rating", "comment", "stage", "created_at"],
  },
  {
    name: "usage_counters",
    pk: ["user_id", "day", "action"],
    conflict: "update-if-newer",
    newer: ["updated_at"],
    greatest: ["count"],
    columns: ["user_id", "day", "action", "count", "updated_at"],
  },
  {
    name: "ai_usage",
    pk: ["id"],
    conflict: "nothing",
    columns: ["id", "tg_id", "model", "tokens", "requests", "day"],
  },
  {
    name: "audit_log",
    pk: ["id"],
    conflict: "nothing",
    columns: ["id", "actor_id", "action", "target", "detail", "created_at"],
  },
];

export const SERIAL_TABLES = ["user_feedback", "ai_usage", "audit_log"];

/**
 * @param {string} name
 * @returns {string}
 */
export function quoteIdent(name) {
  if (typeof name !== "string" || !IDENT.test(name)) {
    throw new Error("invalid identifier");
  }
  return `"${name}"`;
}

/**
 * Strip connection strings / token-shaped values from log text.
 * @param {unknown} value
 * @returns {string}
 */
export function redact(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgres://***")
    .replace(
      /\b(DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL|DATABASE_URL_UNPOOLED|BLOB_READ_WRITE_TOKEN|PGLITE_DUMP_PATH)=[^\s]+/gi,
      "$1=***",
    )
    .replace(
      /\b([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)[A-Za-z0-9_]*)\s*[:=]\s*[^\s]+/gi,
      "$1=***",
    );
}

/**
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} [env]
 */
export function parseArgs(argv, env = process.env) {
  const out = { dumpPath: undefined, dryRun: false, help: false, error: undefined };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--dump") {
      const next = argv[i + 1];
      if (!next) return { ...out, error: "usage: --dump <path>" };
      out.dumpPath = next;
      i += 1;
    } else if (a.startsWith("-")) {
      return { ...out, error: `unknown option: ${a}` };
    } else rest.push(a);
  }
  if (rest.length > 1) return { ...out, error: `unexpected argument: ${rest[1]}` };
  if (!out.dumpPath) out.dumpPath = rest[0] || env.PGLITE_DUMP_PATH?.trim() || undefined;
  return out;
}

export const USAGE =
  "usage: node scripts/migrate-pglite-dump.mjs [--dry-run] [--dump <path> | dump-path]\n" +
  "       dump path also read from PGLITE_DUMP_PATH. DATABASE_URL required unless --dry-run.";

/**
 * @param {string[]} preferred
 * @param {Iterable<string>} available
 * @returns {string[]}
 */
export function intersectColumns(preferred, available) {
  const have = new Set(available);
  return preferred.filter((c) => have.has(c) && IDENT.test(c));
}

/**
 * @param {string} qualifier  table name or "EXCLUDED"
 * @param {string[]} cols
 */
export function coalesceIdent(qualifier, cols) {
  const q = qualifier === "EXCLUDED" ? "EXCLUDED" : quoteIdent(qualifier);
  const parts = cols.filter((c) => IDENT.test(c)).map((c) => `${q}.${quoteIdent(c)}`);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `COALESCE(${parts.join(", ")})`;
}

/**
 * @param {{ name: string, pk: string[], conflict: string, newer?: string[], greatest?: string[] }} spec
 * @param {string[]} columns
 */
export function buildUpsertSql(spec, columns) {
  const cols = columns.filter((c) => IDENT.test(c));
  if (!spec.pk.every((p) => cols.includes(p))) {
    throw new Error(`missing pk columns for ${spec.name}`);
  }
  const table = quoteIdent(spec.name);
  const colList = cols.map(quoteIdent).join(", ");
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const pkList = spec.pk.map(quoteIdent).join(", ");
  const insert = `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`;
  const returning = " RETURNING 1 AS applied";

  if (spec.conflict === "nothing") {
    return {
      text: `${insert} ON CONFLICT (${pkList}) DO NOTHING${returning}`,
      columns: cols,
    };
  }

  const nonPk = cols.filter((c) => !spec.pk.includes(c));
  if (nonPk.length === 0) {
    return {
      text: `${insert} ON CONFLICT (${pkList}) DO NOTHING${returning}`,
      columns: cols,
    };
  }

  const setClauses = nonPk.map((c) => {
    const q = quoteIdent(c);
    if (spec.greatest?.includes(c)) {
      return `${q} = GREATEST(${table}.${q}, EXCLUDED.${q})`;
    }
    return `${q} = EXCLUDED.${q}`;
  });

  const srcTs = spec.newer?.length ? coalesceIdent("EXCLUDED", spec.newer) : null;
  const dstTs = spec.newer?.length ? coalesceIdent(spec.name, spec.newer) : null;
  // Strictly newer dump row only — equal/newer Postgres is left untouched.
  const where = srcTs && dstTs ? ` WHERE ${srcTs} > ${dstTs}` : "";

  return {
    text:
      `${insert} ON CONFLICT (${pkList}) DO UPDATE SET ${setClauses.join(", ")}` +
      `${where}${returning}`,
    columns: cols,
  };
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function toMillis(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

/**
 * COALESCE(newer cols) as epoch ms — first non-null, matching SQL COALESCE.
 * @param {Record<string, unknown>} row
 * @param {string[] | undefined} newer
 */
export function rowNewerMs(row, newer) {
  if (!newer?.length) return null;
  for (const col of newer) {
    const t = toMillis(row[col]);
    if (t != null) return t;
  }
  return null;
}

/**
 * @param {string[]} pk
 * @param {Record<string, unknown>} row
 */
export function rowKey(pk, row) {
  return pk.map((c) => String(row[c] ?? "")).join("\0");
}

/**
 * @param {{ pk: string[], conflict: string, newer?: string[] }} spec
 * @param {Record<string, unknown>} sourceRow
 * @param {Record<string, unknown> | undefined} destRow
 * @returns {"insert" | "update" | "skip"}
 */
export function classifyRow(spec, sourceRow, destRow) {
  if (!destRow) return "insert";
  if (spec.conflict === "nothing") return "skip";
  const src = rowNewerMs(sourceRow, spec.newer);
  const dst = rowNewerMs(destRow, spec.newer);
  if (src != null && (dst == null || src > dst)) return "update";
  return "skip";
}

/**
 * Dry-run UPSERT against an in-memory dest set. `inserted` = new row or
 * newer-source update; `skipped` = dest exists and is equal/newer, or
 * DO NOTHING conflict.
 *
 * @param {{ name: string, pk: string[], conflict: string, newer?: string[] }} spec
 * @param {Record<string, unknown>[]} sourceRows
 * @param {Record<string, unknown>[]} destRows
 */
export function dryRunCounts(spec, sourceRows, destRows = []) {
  const destByKey = new Map(destRows.map((r) => [rowKey(spec.pk, r), r]));
  let inserted = 0;
  let skipped = 0;
  for (const src of sourceRows) {
    const dest = destByKey.get(rowKey(spec.pk, src));
    const kind = classifyRow(spec, src, dest);
    if (kind === "skip") skipped += 1;
    else inserted += 1;
  }
  return {
    table: spec.name,
    source_rows: sourceRows.length,
    inserted,
    skipped,
  };
}

/**
 * @param {Array<{ table: string, source_rows: number, inserted: number, skipped: number }>} rows
 */
export function formatCounts(rows) {
  const header = ["table", "source_rows", "inserted", "skipped"];
  const widths = [24, 12, 10, 10];
  const pad = (s, i, num) => {
    const t = String(s);
    return num ? t.padStart(widths[i]) : t.padEnd(widths[i]);
  };
  const lines = [header.map((h, i) => pad(h, i, i > 0)).join(" ")];
  let source = 0;
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    source += r.source_rows;
    inserted += r.inserted;
    skipped += r.skipped;
    lines.push(
      [
        pad(r.table, 0, false),
        pad(r.source_rows, 1, true),
        pad(r.inserted, 2, true),
        pad(r.skipped, 3, true),
      ].join(" "),
    );
  }
  lines.push(
    [pad("TOTAL", 0, false), pad(source, 1, true), pad(inserted, 2, true), pad(skipped, 3, true)].join(
      " ",
    ),
  );
  return lines.join("\n");
}

/** JSON-safe, driver-friendly parameter. Never logs the value. */
export function toPgValue(value) {
  if (typeof value === "bigint") {
    if (value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER) {
      return Number(value);
    }
    return value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return value;
}

export function supabaseCompatUrl(url) {
  try {
    const parsed = new URL(url.replace(/^postgres:/, "postgresql:"));
    if (/\.supabase\.(co|com)$/i.test(parsed.hostname)) {
      parsed.searchParams.set("sslmode", "require");
      parsed.searchParams.set("uselibpqcompat", "true");
      return parsed.toString();
    }
  } catch {
    /* keep original */
  }
  return url;
}

export function readDatabaseUrl(env = process.env) {
  const raw =
    env.DATABASE_URL || env.POSTGRES_URL || env.POSTGRES_PRISMA_URL || env.DATABASE_URL_UNPOOLED;
  return raw && raw.trim() ? raw.trim() : undefined;
}

/**
 * @param {import("@electric-sql/pglite").PGlite | { query: Function }} db
 * @param {string} table
 */
export async function tableExists(db, table) {
  const res = await db.query(
    "select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = $1) as ok",
    [table],
  );
  const row = res.rows?.[0] ?? res[0];
  return Boolean(row?.ok === true || row?.ok === "t" || row?.ok === "true");
}

/**
 * @param {import("@electric-sql/pglite").PGlite | { query: Function }} db
 * @param {string} table
 */
export async function tableColumns(db, table) {
  const res = await db.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
    [table],
  );
  const rows = res.rows ?? res;
  return rows.map((r) => String(r.column_name));
}

/**
 * @param {string} filePath
 * @returns {Promise<import("@electric-sql/pglite").PGlite>}
 */
export async function openPgliteDump(filePath) {
  const { PGlite } = await import("@electric-sql/pglite");
  const buf = await readFile(filePath);
  const blob = new Blob([buf]);
  const pg = new PGlite({ loadDataDir: blob });
  await pg.waitReady;
  return pg;
}

function paramsFor(row, columns) {
  return columns.map((c) => toPgValue(row[c]));
}

/**
 * @param {{ query: Function }} dest
 * @param {object} spec
 * @param {string[]} columns
 * @param {Record<string, unknown>[]} sourceRows
 */
export async function upsertRows(dest, spec, columns, sourceRows) {
  const { text } = buildUpsertSql(spec, columns);
  let inserted = 0;
  let skipped = 0;
  for (const row of sourceRows) {
    try {
      const res = await dest.query(text, paramsFor(row, columns));
      const applied = Array.isArray(res?.rows) ? res.rows.length : (res?.rowCount ?? 0);
      if (applied > 0) inserted += 1;
      else skipped += 1;
    } catch (err) {
      if (err?.code === "23505") {
        skipped += 1;
        continue;
      }
      throw err;
    }
  }
  return { table: spec.name, source_rows: sourceRows.length, inserted, skipped };
}

async function bumpSerial(dest, table) {
  try {
    const seqRes = await dest.query("select pg_get_serial_sequence($1, 'id') as seq", [table]);
    const seq = seqRes.rows?.[0]?.seq;
    if (!seq) return;
    await dest.query(
      `select setval($1::regclass, greatest(coalesce((select max(id) from ${quoteIdent(table)}), 1), 1))`,
      [seq],
    );
  } catch {
    /* dest without sequences — ignore */
  }
}

async function fetchDestIndex(dest, spec, columns) {
  const need = [...new Set([...spec.pk, ...(spec.newer ?? [])])].filter((c) => columns.includes(c));
  if (need.length === 0) return [];
  const res = await dest.query(
    `select ${need.map(quoteIdent).join(", ")} from ${quoteIdent(spec.name)}`,
  );
  return res.rows ?? [];
}

async function migrateTable(source, dest, spec, { dryRun }) {
  const empty = { table: spec.name, source_rows: 0, inserted: 0, skipped: 0 };
  if (!(await tableExists(source, spec.name))) {
    return { ...empty, absent: "source" };
  }
  const srcCols = await tableColumns(source, spec.name);
  const columns = intersectColumns(spec.columns, srcCols);
  if (!spec.pk.every((p) => columns.includes(p))) {
    return { ...empty, absent: "pk" };
  }
  const srcRes = await source.query(`select ${columns.map(quoteIdent).join(", ")} from ${quoteIdent(spec.name)}`);
  const sourceRows = srcRes.rows ?? [];

  if (dryRun) {
    let destRows = [];
    if (dest && (await tableExists(dest, spec.name))) {
      const destCols = await tableColumns(dest, spec.name);
      destRows = await fetchDestIndex(dest, spec, destCols);
    }
    return dryRunCounts(spec, sourceRows, destRows);
  }

  if (!dest) {
    return { table: spec.name, source_rows: sourceRows.length, inserted: 0, skipped: sourceRows.length };
  }
  if (!(await tableExists(dest, spec.name))) {
    return { table: spec.name, source_rows: sourceRows.length, inserted: 0, skipped: sourceRows.length, absent: "dest" };
  }
  const destCols = await tableColumns(dest, spec.name);
  const liveCols = intersectColumns(columns, destCols);
  if (!spec.pk.every((p) => liveCols.includes(p))) {
    return { table: spec.name, source_rows: sourceRows.length, inserted: 0, skipped: sourceRows.length, absent: "dest-pk" };
  }
  const counts = await upsertRows(dest, spec, liveCols, sourceRows);
  if (SERIAL_TABLES.includes(spec.name) && counts.inserted > 0) {
    await bumpSerial(dest, spec.name);
  }
  return counts;
}

function logErr(prefix, err) {
  const msg = redact(err?.message || err);
  console.error(`${prefix}${msg}`);
  for (const key of ["code", "detail", "hint", "position", "where"]) {
    if (err?.[key] != null) console.error(`${prefix}  ${key}: ${redact(err[key])}`);
  }
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv, env);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.error) {
    console.error(`[migrate-dump] ${args.error}`);
    console.error(USAGE);
    return 1;
  }
  if (!args.dumpPath) {
    console.error("[migrate-dump] dump path required (argv or PGLITE_DUMP_PATH)");
    console.error(USAGE);
    return 1;
  }
  if (!existsSync(args.dumpPath)) {
    console.error("[migrate-dump] dump file not found (path omitted)");
    return 1;
  }

  const databaseUrl = readDatabaseUrl(env);
  if (!databaseUrl && !args.dryRun) {
    console.error("[migrate-dump] DATABASE_URL required (or pass --dry-run)");
    return 1;
  }

  let source;
  try {
    source = await openPgliteDump(args.dumpPath);
  } catch (err) {
    logErr("[migrate-dump] failed to open PGlite dump: ", err);
    return 1;
  }

  let pool;
  let dest;
  try {
    if (databaseUrl) {
      const pgMod = await import("pg");
      const Pool = pgMod.default?.Pool ?? pgMod.Pool;
      pool = new Pool({
        connectionString: supabaseCompatUrl(databaseUrl),
        max: 1,
      });
      dest = await pool.connect();
    }

    const results = [];
    for (const spec of TABLES) {
      try {
        if (dest && !args.dryRun) await dest.query("BEGIN");
        const row = await migrateTable(source, dest, spec, { dryRun: args.dryRun });
        if (dest && !args.dryRun) await dest.query("COMMIT");
        results.push(row);
        if (row.absent && row.absent !== "source") {
          console.error(`[migrate-dump] ${row.table}: skipped (${row.absent})`);
        }
      } catch (err) {
        if (dest && !args.dryRun) {
          try {
            await dest.query("ROLLBACK");
          } catch {
            /* keep original */
          }
        }
        logErr(`[migrate-dump] ${spec.name} failed: `, err);
        results.push({
          table: spec.name,
          source_rows: 0,
          inserted: 0,
          skipped: 0,
        });
      }
    }

    if (args.dryRun) console.log("[migrate-dump] dry-run (no writes)");
    console.log(formatCounts(results));
    return 0;
  } finally {
    try {
      dest?.release?.();
    } catch {
      /* ignore */
    }
    try {
      await pool?.end?.();
    } catch {
      /* ignore */
    }
    try {
      await source?.close?.();
    } catch {
      /* ignore */
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code ?? 0),
    (err) => {
      logErr("[migrate-dump] failed: ", err);
      process.exit(1);
    },
  );
}