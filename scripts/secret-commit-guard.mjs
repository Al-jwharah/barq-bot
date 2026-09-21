#!/usr/bin/env node
/**
 * Fail a commit if staged files contain secret-like patterns.
 *
 * Matches: Telegram bot tokens, xai- API keys, Supabase sbp_ PATs,
 * and postgres URLs that include a password. Prints
 *   secret-like pattern in <path>
 * and never prints the matched values.
 *
 *   node scripts/secret-commit-guard.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = joinDir();

function joinDir() {
  return dirname(fileURLToPath(import.meta.url)).replace(/[/\\]scripts$/, "") || ".";
}

/** Telegram bot token: digits : AA + token body. */
const TELEGRAM_TOKEN = /\d{8,12}:AA[A-Za-z0-9_-]{20,}/;
/** xAI secret keys — length avoids hostnames like xai-org. */
const XAI_KEY = /\bxai-[A-Za-z0-9]{20,}/i;
/** Supabase personal access token. */
const SBP_PAT = /\bsbp_[A-Za-z0-9]{20,}/;
/** postgres URL that includes a password component. */
const POSTGRES_PASSWORD_URL = /(?:postgres(?:ql)?):\/\/[^\s:/]+:[^\s@/]+@/i;

const PLACEHOLDER_PASS = /^(PASSWORD|password|pass|secret|changeme|your[_-]?password|xxx|\*+)$/i;

/**
 * True when `text` contains a secret-like pattern. Does not return the match.
 * @param {string} text
 * @returns {boolean}
 */
export function hasSecretLikePattern(text) {
  if (!text) return false;
  if (TELEGRAM_TOKEN.test(text)) return true;
  if (XAI_KEY.test(text)) return true;
  if (SBP_PAT.test(text)) return true;
  if (POSTGRES_PASSWORD_URL.test(text) && postgresPasswordUrl(text)) return true;
  return false;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function postgresPasswordUrl(text) {
  const re = /(?:postgres(?:ql)?):\/\/([^:\s]+):([^@\s]+)@/gi;
  for (const match of text.matchAll(re)) {
    const pass = safeDecode(match[2] ?? "");
    if (!pass) continue;
    if (PLACEHOLDER_PASS.test(pass)) continue;
    return true;
  }
  return false;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Staged paths (added/copied/modified/renamed). Empty when git is unavailable
 * or nothing is staged.
 * @returns {string[]}
 */
export function stagedPaths() {
  const result = spawnSync("git", ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  const raw = result.stdout || "";
  return raw.split("\0").map((p) => p.trim()).filter(Boolean);
}

/**
 * Staged blob for `path`, or empty string if git cannot show it (binary/missing).
 * @param {string} path
 * @returns {string}
 */
export function stagedContent(path) {
  const result = spawnSync("git", ["show", `:${path}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) return "";
  const out = result.stdout ?? "";
  if (out.includes("\0")) return "";
  return out;
}

/**
 * @param {Iterable<string>} paths
 * @param {(path: string) => string} read
 * @returns {string[]} offending paths, no values
 */
export function findSecretLikePaths(paths, read = stagedContent) {
  const hits = [];
  for (const path of paths) {
    if (shouldSkip(path)) continue;
    const body = read(path);
    if (hasSecretLikePattern(body)) hits.push(path);
  }
  return hits;
}

function shouldSkip(path) {
  const p = path.replace(/\\/g, "/");
  if (p.startsWith("node_modules/") || p.includes("/node_modules/")) return true;
  if (p.startsWith(".git/")) return true;
  if (p.endsWith(".lock") || p.endsWith("package-lock.json")) return true;
  if (p.endsWith("secrets.test.ts")) return true;
  if (p.endsWith("secret-commit-guard.mjs")) return true;
  if (p.endsWith("secret-commit-guard.test.mjs")) return true;
  if (p.endsWith("migrate-pglite-dump.test.mjs")) return true;
  return false;
}

function reportAndExit(paths) {
  for (const path of paths) {
    console.error(`secret-like pattern in ${path}`);
  }
  process.exit(paths.length > 0 ? 1 : 0);
}

function main() {
  const hits = findSecretLikePaths(stagedPaths());
  reportAndExit(hits);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
