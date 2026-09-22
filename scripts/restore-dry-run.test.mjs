import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { projectRoot } from "./with-app-env.mjs";

const root = projectRoot();
const script = join(root, "scripts/restore-dry-run.mjs");
const store = join(root, "src/lib/bot/store.server.ts");
const api = join(root, "src/routes/api/backup.ts");

test("restoreBackup upserts promo_codes and ops metadata tables", () => {
  const src = readFileSync(store, "utf8");
  assert.match(src, /insert into promo_codes/);
  assert.match(src, /from bans/);
  assert.match(src, /from support_tickets/);
  assert.match(src, /from clip_links/);
  assert.match(src, /from download_jobs/);
  assert.match(src, /restored_from_backup/);
  assert.match(src, /export async function applyRestoreSnapshot/);
  assert.match(src, /snap\.bans/);
  assert.match(src, /snap\.tickets/);
  assert.match(src, /snap\.clips/);
  assert.match(src, /snap\.jobs/);
});

test("backup API returns extended restore counts", () => {
  const src = readFileSync(api, "utf8");
  assert.match(src, /bans: tested\.bans/);
  assert.match(src, /tickets: result\.tickets/);
  assert.match(src, /clips: result\.clips/);
  assert.match(src, /jobs: result\.jobs/);
});

test("restore-dry-run refuses identical DATABASE_URL and RESTORE_DATABASE_URL", () => {
  const url = "postgresql://u:p@127.0.0.1:5432/barq";
  const run = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: url,
      RESTORE_DATABASE_URL: url,
      // avoid inheriting unrelated DB urls
      POSTGRES_URL: "",
      POSTGRES_PRISMA_URL: "",
      DATABASE_URL_UNPOOLED: "",
    },
  });
  assert.equal(run.status, 2);
  assert.match(run.stderr + run.stdout, /REFUSING|matches DATABASE_URL/i);
});

test("restore-dry-run writes RESTORE_PROOF.md without secrets", () => {
  const run = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "",
      RESTORE_DATABASE_URL: "",
      POSTGRES_URL: "",
      POSTGRES_PRISMA_URL: "",
      DATABASE_URL_UNPOOLED: "",
    },
  });
  // 0 even if pglite missing — proof file is the deliverable
  assert.equal(run.status, 0);
  const proof = join(root, "RESTORE_PROOF.md");
  assert.equal(existsSync(proof), true);
  const body = readFileSync(proof, "utf8");
  assert.match(body, /Owner steps/);
  assert.match(body, /promo_codes/);
  assert.doesNotMatch(body, /postgresql:\/\/[^:]+:[^@]+@/i);
  assert.doesNotMatch(body, /eyJ[a-zA-Z0-9_-]{20,}/);
});
