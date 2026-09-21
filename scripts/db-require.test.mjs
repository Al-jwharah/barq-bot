import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { projectRoot } from "./with-app-env.mjs";

const DB_TS = join(projectRoot(), "src/lib/db.ts");
const THROW_MSG =
  "DATABASE_URL required (BARQ_REQUIRE_POSTGRES is set; refusing PGLite fallback)";

function probeRequire(env) {
  const probe = `
    const v = process.env.BARQ_REQUIRE_POSTGRES?.trim().toLowerCase();
    const requirePostgres = v === "true" || v === "1" || v === "on";
    const raw =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.DATABASE_URL_UNPOOLED ||
      "";
    const databaseUrl = raw.trim() ? raw.trim() : undefined;
    if (requirePostgres && !databaseUrl) {
      throw new Error(${JSON.stringify(THROW_MSG)});
    }
    console.log("unexpected-ok");
  `;
  return spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("getSql throws DATABASE_URL required when BARQ_REQUIRE_POSTGRES is on", () => {
  const src = readFileSync(DB_TS, "utf8");
  assert.match(src, /BARQ_REQUIRE_POSTGRES/);
  assert.match(src, /throw postgresRequiredError\(\)|DATABASE_URL required \(BARQ_REQUIRE_POSTGRES is set; refusing PGLite fallback\)/);
  assert.match(src, /assertPostgresIfRequired/);
  assert.match(src, /createPgliteSql[\s\S]*assertPostgresIfRequired/);
  assert.match(src, /getPglite[\s\S]*assertPostgresIfRequired/);
  assert.match(src, /does not change `dbSource`/);
  assert.doesNotMatch(src, /throw new Error\("DATABASE_URL required"\)/);

  const fail = probeRequire({
    BARQ_REQUIRE_POSTGRES: "true",
    DATABASE_URL: "",
    POSTGRES_URL: "",
    POSTGRES_PRISMA_URL: "",
    DATABASE_URL_UNPOOLED: "",
  });
  assert.notEqual(fail.status, 0);
  assert.match(fail.stderr + fail.stdout, /DATABASE_URL required/);
  assert.match(fail.stderr + fail.stdout, /refusing PGLite fallback/);

  const ok = probeRequire({
    BARQ_REQUIRE_POSTGRES: "true",
    DATABASE_URL: "postgres://x",
  });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /unexpected-ok/);
});

test("BARQ_REQUIRE_POSTGRES=1 and on throw without DATABASE_URL", () => {
  for (const flag of ["1", "on", "TRUE"]) {
    const fail = probeRequire({
      BARQ_REQUIRE_POSTGRES: flag,
      DATABASE_URL: "",
      POSTGRES_URL: "",
      POSTGRES_PRISMA_URL: "",
      DATABASE_URL_UNPOOLED: "",
    });
    assert.notEqual(fail.status, 0, `expected throw for ${flag}`);
    assert.match(fail.stderr + fail.stdout, /DATABASE_URL required/);
  }
});

test("whitespace DATABASE_URL is treated as unset", () => {
  const fail = probeRequire({
    BARQ_REQUIRE_POSTGRES: "true",
    DATABASE_URL: "   ",
    POSTGRES_URL: "\t",
    POSTGRES_PRISMA_URL: "",
    DATABASE_URL_UNPOOLED: "",
  });
  assert.notEqual(fail.status, 0);
  assert.match(fail.stderr + fail.stdout, /refusing PGLite fallback/);
});

test("POSTGRES_URL / POSTGRES_PRISMA_URL / DATABASE_URL_UNPOOLED satisfy require", () => {
  for (const key of ["POSTGRES_URL", "POSTGRES_PRISMA_URL", "DATABASE_URL_UNPOOLED"]) {
    const ok = probeRequire({
      BARQ_REQUIRE_POSTGRES: "true",
      DATABASE_URL: "",
      POSTGRES_URL: "",
      POSTGRES_PRISMA_URL: "",
      DATABASE_URL_UNPOOLED: "",
      [key]: "postgres://ok",
    });
    assert.equal(ok.status, 0, `expected ok for ${key}`);
    assert.match(ok.stdout, /unexpected-ok/);
  }
});

test("BARQ_REQUIRE_POSTGRES unset keeps PGLite fallback (no throw)", () => {
  const ok = probeRequire({
    BARQ_REQUIRE_POSTGRES: "",
    DATABASE_URL: "",
    POSTGRES_URL: "",
    POSTGRES_PRISMA_URL: "",
    DATABASE_URL_UNPOOLED: "",
  });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /unexpected-ok/);
});

test("getSql source throws before opening PGLite", () => {
  const src = readFileSync(DB_TS, "utf8");
  const getSqlIdx = src.indexOf("export function getSql()");
  const createSqlIdx = src.indexOf("sqlPromise ??= createSql()");
  const assertIdx = src.indexOf("assertPostgresIfRequired()", getSqlIdx);
  assert.ok(getSqlIdx >= 0);
  assert.ok(createSqlIdx > getSqlIdx);
  assert.ok(assertIdx > getSqlIdx && assertIdx < createSqlIdx);
  assert.match(src, /eager start[\s\S]*!requirePostgres\(\)/);
});
