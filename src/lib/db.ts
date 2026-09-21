import { pendingMigrations } from "../../scripts/migration-plan.mjs";

/** Which database backend is active. */
export type DbSource = "neon" | "pglite";

const BLOB_DUMP_KEY = "barq-pglite.dump";

function readDatabaseUrl(): string | undefined {
  if (typeof process === "undefined") return undefined;
  const raw =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL_UNPOOLED;
  return raw && raw.trim() ? raw.trim() : undefined;
}

function requirePostgres(): boolean {
  if (typeof process === "undefined") return false;
  const v = process.env.BARQ_REQUIRE_POSTGRES?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on";
}

// An empty/whitespace DATABASE_URL (an easy misconfig in deploy UIs) must mean
// "unset" — otherwise production would silently run on the PGLite fallback.
const databaseUrl = readDatabaseUrl();

function postgresRequiredError(): Error {
  return new Error(
    "DATABASE_URL required (BARQ_REQUIRE_POSTGRES is set; refusing PGLite fallback)",
  );
}

function assertPostgresIfRequired(): void {
  if (requirePostgres() && !databaseUrl) throw postgresRequiredError();
}

function blobPersistEnabled(): boolean {
  return Boolean(
    typeof process !== "undefined" &&
      process.env.VERCEL &&
      process.env.BLOB_READ_WRITE_TOKEN?.trim(),
  );
}

/** Load WASM/data that Nitro forgot to copy next to the bundled PGLite module. */
async function loadPgliteRuntimeAssets(): Promise<{
  pgliteWasmModule?: WebAssembly.Module;
  initdbWasmModule?: WebAssembly.Module;
  fsBundle?: Blob;
}> {
  if (typeof process === "undefined" || !process.env.VERCEL) return {};
  const { existsSync } = await import("node:fs");
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dirs = [
    join(process.cwd(), "_libs"),
    "/var/task/_libs",
    join(process.cwd()),
    "/var/task",
    join(process.cwd(), "node_modules/@electric-sql/pglite/dist"),
  ];
  for (const dir of dirs) {
    const dataPath = join(dir, "pglite.data");
    const wasmPath = join(dir, "pglite.wasm");
    const initPath = join(dir, "initdb.wasm");
    if (!existsSync(dataPath) || !existsSync(wasmPath)) continue;
    try {
      const [dataBuf, wasmBuf, initBuf] = await Promise.all([
        readFile(dataPath),
        readFile(wasmPath),
        existsSync(initPath) ? readFile(initPath) : Promise.resolve(null),
      ]);
      return {
        fsBundle: new Blob([dataBuf]),
        pgliteWasmModule: await WebAssembly.compile(wasmBuf),
        initdbWasmModule: initBuf ? await WebAssembly.compile(initBuf) : undefined,
      };
    } catch (err) {
      console.error("[db] pglite asset load failed from", dir, err);
    }
  }
  return {};
}

/**
 * Active backend: real **Neon/Postgres** when `DATABASE_URL` / `POSTGRES_URL`
 * is set (deployed / configured sandbox), otherwise a local embedded **PGLite**
 * (Postgres compiled to WASM). On Vercel without Postgres, PGLite snapshots
 * On Vercel without Postgres, PGLite snapshots persist to Blob as a last-resort
 * preview fallback. Production must set DATABASE_URL; Blob is for media files only,
 * not a transactional store.
 *
 * `BARQ_REQUIRE_POSTGRES=true|1|on` does not change `dbSource`; `getSql()`
 * throws instead of opening PGLite so production cannot silently fall back.
 */
export const dbSource: DbSource = databaseUrl ? "neon" : "pglite";

/**
 * Minimal shared SQL surface, satisfied by both Neon and PGLite. Both the
 * tagged-template and `.query()` forms resolve to an array of row objects:
 *
 *   const sql = await getSql();
 *   const rows = await sql`select * from todos where id = ${id}`; // parameterized
 *   const rows2 = await sql.query("select * from todos where id = $1", [id]);
 */
export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
}

/**
 * Init state lives on globalThis as promises: dev HMR creates new instances of
 * this module, and two instances racing module-level state would open a second
 * pool or run two concurrent PGLite migration passes (whose duplicate
 * `_migrations` insert rejects — and would get memoized, poisoning every later
 * `getSql()`). A failed init clears its slot so the next call retries.
 */
const globalRef = globalThis as typeof globalThis & {
  __pgSqlPromise__?: Promise<Sql>;
  __pgPool__?: import("pg").Pool;
  __pgliteInstance__?: Promise<import("@electric-sql/pglite").PGlite>;
  __pgliteMigrateChain__?: Promise<void>;
  __pgliteDirty__?: boolean;
  __pgliteFlushChain__?: Promise<void>;
};

/**
 * Result-type parity: Postgres sends every value as text plus a type OID — the
 * JS value is the DRIVER's parsing choice, and pg and PGLite disagree (pg:
 * int8 -> string, date -> local-midnight Date; PGLite: int8 -> BigInt, which
 * JSON.stringify rejects, date -> UTC Date). Normalize both so preview and
 * production return identical, JSON-safe shapes:
 *   int8/bigint (incl. count(*)) -> number (past 2^53 loses precision — cast
 *                                   `::text` if you ever need huge integers)
 *   date                         -> 'YYYY-MM-DD' string
 *   interval                     -> Postgres interval text
 * numeric already comes back as a string on both (arbitrary precision).
 */
const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;

type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

/** Wrap a query runner in the tagged-template + `.query()` `Sql` surface. */
function toSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    // Rebuild with $1, $2, … placeholders so values stay parameterized.
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return sql;
}

function isWriteSql(text: string): boolean {
  return !/^\s*(select|show|explain)\b/i.test(text);
}

async function loadBlobDump(): Promise<Blob | undefined> {
  if (!blobPersistEnabled()) return undefined;
  const token = process.env.BLOB_READ_WRITE_TOKEN!.trim();
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: "barq-pglite", token, limit: 8 });
    const hit =
      blobs.find((b) => b.pathname === BLOB_DUMP_KEY) ??
      blobs.find((b) => b.pathname.startsWith("barq-pglite"));
    if (!hit) return undefined;
    const res = await fetch(hit.url);
    if (!res.ok) return undefined;
    return await res.blob();
  } catch (err) {
    console.error("[db] blob load failed:", err);
    return undefined;
  }
}

async function saveBlobDump(pg: import("@electric-sql/pglite").PGlite): Promise<void> {
  if (!blobPersistEnabled()) return;
  const token = process.env.BLOB_READ_WRITE_TOKEN!.trim();
  try {
    const dump = await pg.dumpDataDir("gzip");
    const { put } = await import("@vercel/blob");
    await put(BLOB_DUMP_KEY, dump, {
      access: "private",
      token,
      allowOverwrite: true,
      addRandomSuffix: false,
    });
  } catch (err) {
    console.error("[db] blob save failed:", err);
  }
}

function postgresPoolOptions(connectionString: string, max: number) {
  let url = connectionString;
  try {
    const parsed = new URL(connectionString.replace(/^postgres:/, "postgresql:"));
    if (/\.supabase\.(co|com)$/i.test(parsed.hostname)) {
      parsed.searchParams.set("sslmode", "require");
      parsed.searchParams.set("uselibpqcompat", "true");
      url = parsed.toString();
    }
  } catch {
    /* keep original */
  }
  return { connectionString: url, max };
}

function createNeonSql(): Promise<Sql> {
  globalRef.__pgSqlPromise__ ??= (async () => {
    // Regular Postgres driver: node-postgres (`pg`) — works directly with Neon's
    // pooled endpoint. One pool per process; warm serverless instances reuse it.
    const { Pool, types } = await import("pg");
    types.setTypeParser(OID_INT8, Number);
    types.setTypeParser(OID_DATE, identity);
    types.setTypeParser(OID_INTERVAL, identity);
    const pool = new Pool(postgresPoolOptions(databaseUrl!, 4));
    globalRef.__pgPool__ = pool;
    return toSql(async <T>(text: string, params: unknown[]) => {
      const res = await pool.query(text, params);
      return res.rows as T[];
    });
  })().catch((err) => {
    globalRef.__pgSqlPromise__ = undefined;
    throw err;
  });
  return globalRef.__pgSqlPromise__;
}

async function createPgliteSql(): Promise<Sql> {
  assertPostgresIfRequired();
  // Embedded Postgres, imported on demand so it never loads on the Neon path.
  // One in-memory instance per process, shared across HMR module instances, so
  // data survives source edits (it resets on dev-server restart).
  globalRef.__pgliteInstance__ ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const dump = await loadBlobDump();
    const assets = await loadPgliteRuntimeAssets();
    const pg = new PGlite({
      loadDataDir: dump,
      parsers: {
        [OID_INT8]: Number,
        [OID_DATE]: identity,
        [OID_INTERVAL]: identity,
      },
      ...assets,
    });
    await pg.waitReady;
    await pg.exec(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    return pg;
  })().catch((err) => {
    globalRef.__pgliteInstance__ = undefined;
    throw err;
  });
  const pg = await globalRef.__pgliteInstance__;

  // Apply migrations/ (the single schema source) so preview matches production.
  // SQL is inlined by the bundler via import.meta.glob (no runtime fs); applied
  // files are tracked in _migrations. The glob does not descend, so the opt-in
  // auth schema under migrations/auth/ stays out. Runs once per module instance
  // — so an HMR reload after adding a migration file applies it live — with
  // passes serialized on a global chain so concurrent callers never
  // double-apply.
  const migrate = async (): Promise<void> => {
    let migrations: Record<string, string> = {};
    try {
      migrations = import.meta.glob("/migrations/*.sql", {
        query: "?raw",
        import: "default",
        eager: true,
      }) as Record<string, string>;
    } catch {
      return;
    }
    if (!migrations || typeof migrations !== "object") return;
    const doneRows = await pg.query<{ name: string }>(
      "select name from _migrations",
    );
    const done = doneRows.rows.map((r) => r.name);
    let applied = 0;
    for (const { name, path } of pendingMigrations(Object.keys(migrations), done)) {
      // Apply + record atomically (parity with scripts/migrate.mjs) so a failed
      // statement can't leave a file half-applied but untracked.
      await pg.transaction(async (tx) => {
        await tx.exec(migrations[path]);
        await tx.query("insert into _migrations (name) values ($1)", [name]);
      });
      applied += 1;
    }
    if (applied > 0) globalRef.__pgliteDirty__ = true;
  };
  const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve())
    .catch(() => undefined) // an earlier failed pass must not wedge the chain
    .then(migrate);
  globalRef.__pgliteMigrateChain__ = pass;
  await pass;

  return toSql(async <T>(text: string, params: unknown[]) => {
    const result = await pg.query<T>(text, params);
    if (isWriteSql(text)) globalRef.__pgliteDirty__ = true;
    return result.rows;
  });
}

let sqlPromise: Promise<Sql> | null = null;

async function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call getSql() from a createServerFn handler " +
        "or a server route loader, never from client code.",
    );
  }
  assertPostgresIfRequired();
  return dbSource === "neon" ? createNeonSql() : createPgliteSql();
}

/**
 * Get the shared, **server-only** SQL client. Neon when `DATABASE_URL` is set,
 * otherwise the local PGLite fallback. Memoized — safe to call per request.
 *
 * When `BARQ_REQUIRE_POSTGRES` is `true`/`1`/`on` and no `DATABASE_URL` is
 * set, throws `Error("DATABASE_URL required (BARQ_REQUIRE_POSTGRES is set; refusing PGLite fallback)")`
 * so production cannot silently use PGLite. Unset/false keeps the current
 * Vercel PGLite+blob fallback.
 *
 * Schema comes from `migrations/*.sql`, auto-applied before the first query on
 * both backends — define tables there, never inline in server functions.
 */
export function getSql(): Promise<Sql> {
  assertPostgresIfRequired();
  sqlPromise ??= createSql().catch((err) => {
    sqlPromise = null; // don't memoize failures — let the next call retry
    throw err;
  });
  return sqlPromise;
}

/** Run writes on one connection so unique claims and job inserts stay atomic. */
export async function withTransaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  assertPostgresIfRequired();
  if (dbSource === "pglite") {
    const pg = await getPglite();
    try {
      return await pg.transaction(async (tx) => {
        const sql = toSql(async <R>(text: string, params: unknown[]) => {
          const result = await tx.query<R>(text, params);
          return result.rows;
        });
        return fn(sql);
      });
    } finally {
      globalRef.__pgliteDirty__ = true;
    }
  }
  await getSql();
  const pool = globalRef.__pgPool__;
  if (!pool) throw new Error("postgres pool missing");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const sql = toSql(async <R>(text: string, params: unknown[]) => {
      const result = await client.query(text, params);
      return result.rows as R[];
    });
    const out = await fn(sql);
    await client.query("commit");
    return out;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Persist PGLite to Vercel Blob after writes. No-op on Neon and in preview.
 * Must be awaited before a serverless function returns.
 */
export async function flushDb(): Promise<void> {
  if (dbSource !== "pglite" || !globalRef.__pgliteDirty__) return;
  const chain = (globalRef.__pgliteFlushChain__ ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      const pg = await globalRef.__pgliteInstance__;
      if (!pg || !globalRef.__pgliteDirty__) return;
      await saveBlobDump(pg);
      globalRef.__pgliteDirty__ = false;
    });
  globalRef.__pgliteFlushChain__ = chain;
  await chain;
}

/**
 * The shared PGLite instance (preview only), with `migrations/*.sql` applied.
 * Lets Better Auth persist to the SAME embedded DB as app data in preview (via a
 * Kysely dialect). Throws when `DATABASE_URL` is set (that path uses Neon).
 */
export async function getPglite(): Promise<import("@electric-sql/pglite").PGlite> {
  assertPostgresIfRequired();
  if (dbSource !== "pglite") {
    throw new Error("getPglite() is only available on the PGLite fallback (no DATABASE_URL)");
  }
  await getSql();
  const pg = await globalRef.__pgliteInstance__;
  if (!pg) throw new Error("PGLite instance failed to initialize");
  return pg;
}

/**
 * Finish DB bootstrap before the server handles traffic.
 *
 * - **PGLite** (preview / no `DATABASE_URL`): open the in-memory DB and apply
 *   `migrations/*.sql`. Idempotent — concurrent callers share one promise.
 * - **Neon**: no-op (pool is created lazily on first query).
 *
 * Vite `configureServer` awaits this at dev startup; production imports of this
 * module kick it off immediately (see bottom of file).
 */
export function ensureDbReady(): Promise<void> {
  if (dbSource !== "pglite") return Promise.resolve();
  return getSql().then(() => undefined);
}

export function dbBackendLabel(): string {
  if (dbSource === "neon") return "postgres";
  if (blobPersistEnabled()) return "pglite+blob";
  return "pglite";
}

// Server-only eager start: kick PGLite bootstrap as soon as this module loads in
// Node. Client bundles never hit this path (`getSql` throws in the browser).
const globalBoot = globalThis as typeof globalThis & {
  __pgBootstrapPromise__?: Promise<void>;
};
if (
  typeof window === "undefined" &&
  dbSource === "pglite" &&
  !process.env.VERCEL &&
  !requirePostgres()
) {
  globalBoot.__pgBootstrapPromise__ ??= ensureDbReady().catch((err) => {
    globalBoot.__pgBootstrapPromise__ = undefined;
    console.error("[db] PGLite bootstrap failed:", err);
  });
}
