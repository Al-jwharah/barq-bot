import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isMigrationFile, migrationName, pendingMigrations } from "./migration-plan.mjs";
import { projectRoot } from "./with-app-env.mjs";

const AUTH_MIGRATION = "0001_auth.sql";
const CONSTRAINTS_MIGRATION = "0021_constraints.sql";

/**
 * The auth-on copy of the Better Auth schema and its source, or null when the
 * app has not turned sign-in on (the shipped state).
 */
function authSchemaCopy(root) {
  const copy = join(root, "migrations", AUTH_MIGRATION);
  const source = join(root, "migrations/auth", AUTH_MIGRATION);
  if (!existsSync(copy) || !existsSync(source)) return null;
  return { copy: readFileSync(copy, "utf8"), source: readFileSync(source, "utf8") };
}

/** Top-level product SQL from 0002 upward. Auth is not included. */
function productMigrationNames(entries) {
  return entries
    .filter((name) => isMigrationFile(name))
    .filter((name) => /^00\d{2}_.+\.sql$/.test(name) && !name.startsWith("0001_"))
    .sort((a, b) => a.localeCompare(b));
}

test("_migrations keys on basename, not path", () => {
  assert.equal(migrationName("/migrations/0002_todos.sql"), "0002_todos.sql");
  assert.equal(migrationName("migrations/auth/0001_auth.sql"), "0001_auth.sql");
  assert.equal(migrationName("0001_auth.sql"), "0001_auth.sql");
});

test("a file already applied from another directory does not re-apply", () => {
  // The auth-on path copies migrations/auth/0001_auth.sql into the globbed
  // directory; a database that already has it must not run it twice.
  assert.deepEqual(pendingMigrations(["/migrations/0001_auth.sql"], ["0001_auth.sql"]), []);
});

test("pending migrations are returned in name order", () => {
  assert.deepEqual(
    pendingMigrations(
      ["/migrations/0003_c.sql", "/migrations/0001_a.sql", "/migrations/0002_b.sql"],
      ["0001_a.sql"],
    ),
    [
      { name: "0002_b.sql", path: "/migrations/0002_b.sql" },
      { name: "0003_c.sql", path: "/migrations/0003_c.sql" },
    ],
  );
});

test("non-.sql entries are dropped (readdir also yields the auth/ directory)", () => {
  assert.equal(isMigrationFile("auth"), false);
  assert.deepEqual(pendingMigrations(["auth", "README.md"], []), []);
});

test("product migrations 0002–0021 are pending on a fresh DB; auth is not auto-applied", () => {
  const migrationsDir = join(projectRoot(), "migrations");
  const entries = readdirSync(migrationsDir);

  assert.equal(isMigrationFile("auth"), false);
  assert.ok(entries.includes("auth"), "auth schema still lives in migrations/auth/");
  assert.ok(
    readdirSync(join(migrationsDir, "auth")).includes(AUTH_MIGRATION),
    "0001_auth.sql stays under migrations/auth/ and is not globbed",
  );
  assert.equal(
    entries.includes(AUTH_MIGRATION),
    false,
    "auth schema must not sit in the top-level glob (not auto-applied)",
  );
  assert.ok(
    entries.includes(CONSTRAINTS_MIGRATION),
    "0021_constraints.sql must sit in the top-level glob",
  );

  const pending = pendingMigrations(entries, []);
  const names = pending.map((row) => row.name);
  const expected = productMigrationNames(entries);

  assert.ok(
    expected.length >= 20,
    "0002_*.sql … 0021_*.sql must exist as top-level product migrations",
  );
  assert.ok(expected[0].startsWith("0002_"));
  assert.ok(expected.some((name) => name.startsWith("0020_")));
  assert.ok(
    expected.includes(CONSTRAINTS_MIGRATION),
    "0021_constraints.sql is a product migration pending on a fresh DB",
  );

  // Product files ARE pending on a fresh DB — they are not an error.
  assert.deepEqual(names, expected);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  assert.equal(names.includes(AUTH_MIGRATION), false);
  for (const row of pending) {
    assert.equal(isMigrationFile(row.name), true);
    assert.equal(row.path, row.name);
  }
});

test("0021_constraints.sql is idempotent uniqueness and never drops rows", () => {
  const sql = readFileSync(join(projectRoot(), "migrations", CONSTRAINTS_MIGRATION), "utf8");
  assert.match(sql, /Never drops rows/);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  for (const needle of [
    "telegram_updates_update_id_uidx",
    "download_jobs_active_key_uidx",
    "clip_links_id_uidx",
    "members_tg_id_uidx",
    "payments_charge_id_uidx",
  ]) {
    assert.match(sql, new RegExp(needle));
  }
  assert.match(sql, /duplicate rows present/);
  assert.match(sql, /create index if not exists/i);
  assert.match(sql, /CREATE UNIQUE INDEX/);
  assert.match(sql, /download_jobs_status_retry_at_idx/);
});

test("applied product migrations drop out; auth still never appears from readdir", () => {
  const migrationsDir = join(projectRoot(), "migrations");
  const entries = readdirSync(migrationsDir);
  const all = productMigrationNames(entries);
  const remaining = pendingMigrations(entries, all).map((row) => row.name);
  assert.deepEqual(remaining, []);
  assert.equal(remaining.includes(AUTH_MIGRATION), false);
});

test("this workspace's auth schema copy is byte-identical to its source", () => {
  // An edited copy diverges silently: basename keying skips it on a database
  // that already ran the original, and applies it on a fresh PGLite preview.
  const pair = authSchemaCopy(projectRoot());
  if (pair === null) return; // sign-in off — nothing has been copied up
  assert.equal(
    pair.copy,
    pair.source,
    "migrations/0001_auth.sql has been edited — it must stay a verbatim copy of migrations/auth/0001_auth.sql",
  );
});

test("the copy check reads both files and catches an edit", () => {
  const root = mkdtempSync(join(tmpdir(), "auth-schema-"));
  mkdirSync(join(root, "migrations/auth"), { recursive: true });
  writeFileSync(join(root, "migrations/auth", AUTH_MIGRATION), "create table t ();\n");
  assert.equal(authSchemaCopy(root), null);

  writeFileSync(join(root, "migrations", AUTH_MIGRATION), "create table t ();\n");
  const same = authSchemaCopy(root);
  assert.equal(same.copy, same.source);

  writeFileSync(join(root, "migrations", AUTH_MIGRATION), "create table t (x int);\n");
  const drifted = authSchemaCopy(root);
  assert.notEqual(drifted.copy, drifted.source);
});
