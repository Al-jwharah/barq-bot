import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const PIN_NEEDLE = "Barq7942";
const TOKEN_RE = /\d{8,12}:AA[A-Za-z0-9_-]{20,}/;
const XAI_RE = /xai-[A-Za-z0-9]{20,}/;
const SBP_RE = /\bsbp_[A-Za-z0-9_]{20,}/;
const BLOB_RE = /vercel_blob_rw_[A-Za-z0-9_]+/;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "attachments",
  "artifacts",
  "public",
  "dist",
  ".output",
  ".vercel",
  ".tanstack",
  ".nitro",
]);

function isBarqReportPy(name: string): boolean {
  return /^BARQ_.*_REPORT\.py$/i.test(name);
}

function isSkippedFile(name: string): boolean {
  if (name.endsWith("secrets.test.ts")) return true;
  if (isBarqReportPy(name)) return true;
  return false;
}

/** Assertion message is the file path only — never the matched secret. */
function failPath(file: string): never {
  assert.fail(file);
}

function isPlaceholderPassword(pass: string): boolean {
  return /^(PASSWORD|password|pass|secret|changeme|your[_-]?password|xxx|\*+|placeholder|example|redacted|<password>)$/i.test(
    pass,
  );
}

function hasPostgresSecret(src: string): boolean {
  const re = /postgres(?:ql)?:\/\/[^/\s:]+:([^/\s@]+)@/gi;
  for (const m of src.matchAll(re)) {
    const pass = m[1] ?? "";
    if (!pass || isPlaceholderPassword(pass)) continue;
    return true;
  }
  return false;
}

function assertClean(file: string, src: string): void {
  if (src.includes(PIN_NEEDLE)) failPath(file);
  if (TOKEN_RE.test(src)) failPath(file);
  if (XAI_RE.test(src)) failPath(file);
  if (SBP_RE.test(src)) failPath(file);
  if (hasPostgresSecret(src)) failPath(file);
  if (BLOB_RE.test(src)) failPath(file);
}

function walkFiles(roots: string[], extraFilter?: (name: string) => boolean): string[] {
  const files: string[] = [];
  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isSkippedFile(entry.name)) continue;
      if (extraFilter && !extraFilter(entry.name)) continue;
      files.push(full);
    }
  }
  for (const root of roots) walk(root);
  return files;
}

test("config and scripts do not embed telegram tokens or xAI keys", () => {
  const files = [
    "src/lib/bot/config.server.ts",
    "scripts/telegram-bot.mjs",
    "src/lib/bot/store.server.ts",
  ];
  for (const file of files) {
    assertClean(file, readFileSync(file, "utf8"));
  }
});

test("webhook files do not print the telegram webhook secret", () => {
  const files = ["src/routes/api/telegram.ts", "src/lib/bot/webhook-guard.ts", "src/lib/bot/webhook.server.ts"];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (/console\.(log|info|debug|error|warn)\([^)]*SECRET/.test(src)) failPath(file);
  }
});

test("src, migrations, and scripts recursively have no embedded secrets", () => {
  const files = walkFiles(["src", "migrations", "scripts"]);
  assert.ok(files.length > 0, "expected files to scan");
  for (const file of files) {
    assertClean(file, readFileSync(file, "utf8"));
  }
});

test("markdown files have no embedded secrets", () => {
  const files = walkFiles(["."], (name) => /\.md$/i.test(name));
  assert.ok(files.length > 0, "expected at least one .md to scan");
  for (const file of files) {
    assertClean(file, readFileSync(file, "utf8"));
  }
});

test("health and observability never interpolate env values into logs or responses", () => {
  const files = ["src/routes/api/health.ts", "src/lib/bot/observability.server.ts"];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (/\$\{\s*process\.env\./.test(src)) failPath(file);
    if (/console\.(log|info|debug|error|warn)\([^)]*process\.env/.test(src)) failPath(file);
    if (/\+\s*process\.env\./.test(src)) failPath(file);
  }
});

test("postgres detector ignores docs placeholders", () => {
  assert.equal(hasPostgresSecret("postgresql://USER:PASSWORD@HOST/db"), false);
  assert.equal(hasPostgresSecret("postgresql://USER@HOST/db"), false);
  assert.equal(hasPostgresSecret("postgresql://app:n0tPlaceholder@HOST/db"), true);
});
