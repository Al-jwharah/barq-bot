import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  TABLES,
  SERIAL_TABLES,
  USAGE,
  buildUpsertSql,
  classifyRow,
  coalesceIdent,
  dryRunCounts,
  formatCounts,
  intersectColumns,
  parseArgs,
  quoteIdent,
  redact,
  rowKey,
  rowNewerMs,
  toMillis,
  toPgValue,
  upsertRows,
} from "./migrate-pglite-dump.mjs";

const SCRIPT = fileURLToPath(new URL("./migrate-pglite-dump.mjs", import.meta.url));

const REQUIRED = [
  "members",
  "bot_settings",
  "promo_codes",
  "bans",
  "support_tickets",
  "download_jobs",
  "clip_links",
  "user_feedback",
  "usage_counters",
  "ai_usage",
  "audit_log",
];

function spec(name) {
  const hit = TABLES.find((t) => t.name === name);
  assert.ok(hit, name);
  return hit;
}

test("covers the required dump tables exactly once", () => {
  assert.deepEqual(
    TABLES.map((t) => t.name).sort(),
    [...REQUIRED].sort(),
  );
  assert.equal(new Set(TABLES.map((t) => t.name)).size, TABLES.length);
  for (const t of TABLES) {
    assert.match(t.name, /^[a-z_]+$/);
    assert.ok(t.pk.length >= 1);
    for (const col of t.columns) assert.match(col, /^[a-z_]+$/);
    assert.ok(t.pk.every((k) => t.columns.includes(k)));
    assert.ok(t.conflict === "nothing" || t.conflict === "update-if-newer");
  }
  for (const name of SERIAL_TABLES) {
    assert.equal(spec(name).conflict, "nothing");
    assert.deepEqual(spec(name).pk, ["id"]);
  }
});

test("quoteIdent quotes safe names and rejects injection", () => {
  assert.equal(quoteIdent("members"), '"members"');
  assert.equal(quoteIdent("tg_id"), '"tg_id"');
  assert.throws(() => quoteIdent('members"; drop table members --'), /invalid identifier/);
  assert.throws(() => quoteIdent("members;select"), /invalid identifier/);
  assert.throws(() => quoteIdent(""), /invalid identifier/);
});

test("buildUpsertSql members updates only when dump row is newer", () => {
  const { text, columns } = buildUpsertSql(spec("members"), [
    "tg_id",
    "username",
    "downloads_used",
    "last_active",
    "created_at",
  ]);
  assert.deepEqual(columns, ["tg_id", "username", "downloads_used", "last_active", "created_at"]);
  assert.match(text, /INSERT INTO "members"/);
  assert.match(text, /ON CONFLICT \("tg_id"\) DO UPDATE SET/);
  assert.match(text, /"username" = EXCLUDED\."username"/);
  assert.match(
    text,
    /"downloads_used" = GREATEST\("members"\."downloads_used", EXCLUDED\."downloads_used"\)/,
  );
  assert.match(
    text,
    /WHERE COALESCE\(EXCLUDED\."last_active", EXCLUDED\."created_at"\) > COALESCE\("members"\."last_active", "members"\."created_at"\)/,
  );
  assert.match(text, /RETURNING 1 AS applied/);
  assert.doesNotMatch(text, /DO NOTHING/);
});

test("buildUpsertSql serial tables use ON CONFLICT DO NOTHING", () => {
  for (const name of ["user_feedback", "ai_usage", "audit_log"]) {
    const { text } = buildUpsertSql(spec(name), spec(name).columns);
    assert.match(text, new RegExp(`INSERT INTO "${name}"`));
    assert.match(text, /ON CONFLICT \("id"\) DO NOTHING/);
    assert.doesNotMatch(text, /DO UPDATE/);
  }
});

test("buildUpsertSql usage_counters conflicts on the composite pk", () => {
  const { text } = buildUpsertSql(spec("usage_counters"), spec("usage_counters").columns);
  assert.match(text, /ON CONFLICT \("user_id", "day", "action"\) DO UPDATE SET/);
  assert.match(text, /"count" = GREATEST\("usage_counters"\."count", EXCLUDED\."count"\)/);
  assert.match(text, /WHERE EXCLUDED\."updated_at" > "usage_counters"\."updated_at"/);
});

test("buildUpsertSql bot_settings does not clobber a newer dest row", () => {
  const { text } = buildUpsertSql(spec("bot_settings"), ["key", "value", "updated_at"]);
  assert.match(text, /ON CONFLICT \("key"\) DO UPDATE SET/);
  assert.match(text, /WHERE EXCLUDED\."updated_at" > "bot_settings"\."updated_at"/);
  assert.match(text, /"value" = EXCLUDED\."value"/);
});

test("buildUpsertSql refuses a column list missing the pk", () => {
  assert.throws(
    () => buildUpsertSql(spec("members"), ["username"]),
    /missing pk columns for members/,
  );
});

test("intersectColumns keeps preferred order and drops unknown", () => {
  assert.deepEqual(
    intersectColumns(["tg_id", "username", "role"], ["role", "tg_id", "extra"]),
    ["tg_id", "role"],
  );
});

test("dry-run fake members: empty dest inserts all", () => {
  const source = [
    { tg_id: "1", last_active: "2024-01-01T00:00:00Z", created_at: "2024-01-01T00:00:00Z" },
    { tg_id: "2", last_active: null, created_at: "2024-01-02T00:00:00Z" },
  ];
  const counts = dryRunCounts(spec("members"), source, []);
  assert.deepEqual(counts, { table: "members", source_rows: 2, inserted: 2, skipped: 0 });
});

test("dry-run fake members: newer dest is skipped, older dest is updated", () => {
  const source = [
    { tg_id: "old", last_active: "2024-01-01T00:00:00Z", created_at: "2024-01-01T00:00:00Z" },
    { tg_id: "new", last_active: "2025-06-01T00:00:00Z", created_at: "2024-01-01T00:00:00Z" },
    { tg_id: "fresh", last_active: "2024-02-01T00:00:00Z", created_at: "2024-01-01T00:00:00Z" },
  ];
  const dest = [
    { tg_id: "old", last_active: "2025-01-01T00:00:00Z", created_at: "2024-01-01T00:00:00Z" },
    { tg_id: "new", last_active: "2024-01-01T00:00:00Z", created_at: "2024-01-01T00:00:00Z" },
  ];
  const counts = dryRunCounts(spec("members"), source, dest);
  assert.equal(counts.source_rows, 3);
  assert.equal(counts.inserted, 2);
  assert.equal(counts.skipped, 1);
  assert.equal(classifyRow(spec("members"), source[0], dest[0]), "skip");
  assert.equal(classifyRow(spec("members"), source[1], dest[1]), "update");
  assert.equal(classifyRow(spec("members"), source[2], undefined), "insert");
});

test("dry-run is idempotent against dest that already matches source", () => {
  const row = {
    tg_id: "8471762251",
    last_active: "2026-01-01T00:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
  };
  const first = dryRunCounts(spec("members"), [row], []);
  assert.equal(first.inserted, 1);
  const second = dryRunCounts(spec("members"), [row], [row]);
  assert.deepEqual(second, { table: "members", source_rows: 1, inserted: 0, skipped: 1 });
});

test("dry-run audit_log DO NOTHING skips existing ids even if dump looks newer", () => {
  const source = [
    { id: 1, action: "a", created_at: "2026-01-01T00:00:00Z" },
    { id: 2, action: "b", created_at: "2026-01-01T00:00:00Z" },
  ];
  const dest = [{ id: 1, action: "older", created_at: "2020-01-01T00:00:00Z" }];
  const counts = dryRunCounts(spec("audit_log"), source, dest);
  assert.deepEqual(counts, { table: "audit_log", source_rows: 2, inserted: 1, skipped: 1 });
});

test("equal timestamps do not clobber dest", () => {
  const ts = "2024-06-01T12:00:00.000Z";
  const src = { key: "porn_filter", value: "off", updated_at: ts };
  const dest = { key: "porn_filter", value: "on", updated_at: ts };
  assert.equal(classifyRow(spec("bot_settings"), src, dest), "skip");
});

test("formatCounts prints only table/source_rows/inserted/skipped", () => {
  const tokenRow = {
    table: "bot_settings",
    source_rows: 18,
    inserted: 0,
    skipped: 18,
    value: "sk-secret-token-SHOULD-NOT-APPEAR",
  };
  const out = formatCounts([
    { table: "members", source_rows: 2, inserted: 2, skipped: 0 },
    tokenRow,
    { table: "promo_codes", source_rows: 2, inserted: 2, skipped: 0 },
  ]);
  assert.match(out, /table/);
  assert.match(out, /source_rows/);
  assert.match(out, /inserted/);
  assert.match(out, /skipped/);
  assert.match(out, /members/);
  assert.match(out, /TOTAL/);
  assert.doesNotMatch(out, /sk-secret-token/);
  assert.doesNotMatch(out, /SHOULD-NOT-APPEAR/);
  assert.doesNotMatch(out, /value/);
});

test("parseArgs reads argv, --dump, env, and --dry-run", () => {
  assert.deepEqual(parseArgs(["./x.dump"], {}), {
    dumpPath: "./x.dump",
    dryRun: false,
    help: false,
    error: undefined,
  });
  assert.equal(parseArgs(["--dry-run"], { PGLITE_DUMP_PATH: "/tmp/a.dump" }).dumpPath, "/tmp/a.dump");
  assert.equal(parseArgs(["--dry-run"], { PGLITE_DUMP_PATH: "/tmp/a.dump" }).dryRun, true);
  assert.equal(
    parseArgs(["--dump", "/tmp/b.dump"], { PGLITE_DUMP_PATH: "/tmp/a.dump" }).dumpPath,
    "/tmp/b.dump",
  );
  assert.equal(parseArgs(["--help"]).help, true);
  assert.match(parseArgs(["--nope"]).error, /unknown option/);
  assert.match(parseArgs(["a", "b"]).error, /unexpected argument: b/);
  assert.match(USAGE, /PGLITE_DUMP_PATH/);
});

test("redact strips connection strings and token assignments", () => {
  const pass = ["hun", "ter2"].join("");
  const blob = ["vercel_blob_rw", "_abc"].join("");
  const leaked = [
    "connect postgres://",
    "user",
    ":",
    pass,
    "@db.example.com:5432/barq failed BLOB_READ_WRITE_TOKEN=",
    blob,
    " DATABASE_URL=postgres://x",
  ].join("");
  const out = redact(leaked);
  assert.doesNotMatch(out, /hunter2/);
  assert.doesNotMatch(out, /vercel_blob_rw/);
  assert.doesNotMatch(out, /db\.example\.com/);
  assert.match(out, /postgres:\/\/\*\*\*/);
  assert.match(out, /BLOB_READ_WRITE_TOKEN=\*\*\*/);
});

test("rowKey / toMillis / toPgValue helpers", () => {
  assert.equal(
    rowKey(["user_id", "day", "action"], { user_id: "1", day: "2024-01-01", action: "dl" }),
    "1\u00002024-01-01\u0000dl",
  );
  assert.equal(toMillis("2024-01-01T00:00:00Z"), Date.parse("2024-01-01T00:00:00Z"));
  assert.equal(toMillis(null), null);
  assert.equal(
    rowNewerMs({ last_active: null, created_at: "2024-02-01T00:00:00Z" }, ["last_active", "created_at"]),
    Date.parse("2024-02-01T00:00:00Z"),
  );
  assert.equal(toPgValue(3n), 3);
  assert.equal(typeof toPgValue(new Date("2024-01-01T00:00:00Z")), "string");
});

test("coalesceIdent builds EXCLUDED vs table COALESCE lists", () => {
  assert.equal(
    coalesceIdent("EXCLUDED", ["last_active", "created_at"]),
    'COALESCE(EXCLUDED."last_active", EXCLUDED."created_at")',
  );
  assert.equal(coalesceIdent("members", ["created_at"]), '"members"."created_at"');
});

test("dry-run result never includes source row fields", () => {
  const counts = dryRunCounts(
    spec("promo_codes"),
    [{ code: "BRQDEAD", days: 30, used_count: 3, created_at: "2024-01-01T00:00:00Z", token: "leak-me" }],
    [],
  );
  assert.deepEqual(Object.keys(counts).sort(), ["inserted", "skipped", "source_rows", "table"]);
  assert.equal(JSON.stringify(counts).includes("leak-me"), false);
  assert.equal(JSON.stringify(counts).includes("BRQDEAD"), false);
});

test("upsertRows counts RETURNING applied vs conflict skip (fake dest)", async () => {
  const dest = {
    async query(_text, params) {
      const tg = params[0];
      if (tg === "exists") return { rows: [], rowCount: 0 };
      if (tg === "dup") {
        const err = new Error("duplicate");
        err.code = "23505";
        throw err;
      }
      return { rows: [{ applied: 1 }], rowCount: 1 };
    },
  };
  const counts = await upsertRows(dest, spec("members"), ["tg_id", "username", "created_at"], [
    { tg_id: "new", username: "a", created_at: "2024-01-01T00:00:00Z" },
    { tg_id: "exists", username: "b", created_at: "2024-01-01T00:00:00Z" },
    { tg_id: "dup", username: "c", created_at: "2024-01-01T00:00:00Z" },
  ]);
  assert.deepEqual(counts, { table: "members", source_rows: 3, inserted: 1, skipped: 2 });
});

test("CLI --help and missing dump do not print secrets", () => {
  const help = spawnSync(process.execPath, [SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /usage:/);
  assert.doesNotMatch(help.stdout + help.stderr, /postgres:\/\//);

  const missing = spawnSync(process.execPath, [SCRIPT, "--dry-run"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PGLITE_DUMP_PATH: "",
      DATABASE_URL: ["postgres://", "user", ":", ["sec", "ret"].join(""), "@host/db"].join(""),
    },
  });
  assert.notEqual(missing.status, 0);
  const all = missing.stdout + missing.stderr;
  assert.doesNotMatch(all, /secret@host/);
  assert.doesNotMatch(all, /postgres:\/\/user/);
});

test("CLI missing file reports error without leaking DATABASE_URL", () => {
  const ghost = join(mkdtempSync(join(tmpdir(), "pglite-mig-")), "nope.dump");
  const missing = spawnSync(process.execPath, [SCRIPT, ghost], {
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: ["postgres://", "user", ":", ["hun", "ter2"].join(""), "@db.internal/barq"].join(""),
    },
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /dump file not found/);
  assert.doesNotMatch(missing.stdout + missing.stderr, /hunter2/);
});
