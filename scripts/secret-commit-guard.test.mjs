import assert from "node:assert/strict";
import { test } from "node:test";
import { hasSecretLikePattern, findSecretLikePaths } from "./secret-commit-guard.mjs";

/**
 * Build secret-shaped strings at runtime so this source file never contains
 * a consecutive token that secrets.test.ts TOKEN_RE / XAI_RE / SBP_RE /
 * POSTGRES_RE would flag.
 */
const COLON = () => String.fromCharCode(58);
const SLASH = () => String.fromCharCode(47);
const AT = () => String.fromCharCode(64);
const HYPHEN = () => String.fromCharCode(45);
const UNDERSCORE = () => String.fromCharCode(95);

function telegramLike() {
  const digits = String.fromCharCode(49).repeat(10);
  const aa = String.fromCharCode(65, 65);
  const body = String.fromCharCode(120).repeat(25);
  return [digits, COLON(), aa, body].join("");
}

function shortTelegramLike() {
  const digits = String.fromCharCode(49).repeat(10);
  const aa = String.fromCharCode(65, 65);
  const body = String.fromCharCode(120).repeat(10);
  return [digits, COLON(), aa, body].join("");
}

function xaiLike() {
  return ["xai", HYPHEN(), String.fromCharCode(99).repeat(24)].join("");
}

function sbpLike() {
  return ["sbp", UNDERSCORE(), String.fromCharCode(100).repeat(24)].join("");
}

function postgresUrl(user, pass, host = ["localhost", SLASH(), "db"].join("")) {
  const scheme = ["postgres", COLON(), SLASH(), SLASH()].join("");
  return [scheme, user, COLON(), pass, AT(), host].join("");
}

test("hasSecretLikePattern is false for empty, prose, and short lookalikes", () => {
  assert.equal(hasSecretLikePattern(""), false);
  assert.equal(hasSecretLikePattern(undefined), false);
  assert.equal(hasSecretLikePattern("hello world"), false);
  assert.equal(hasSecretLikePattern("xai-org"), false);
  assert.equal(hasSecretLikePattern(shortTelegramLike()), false);
  assert.equal(hasSecretLikePattern(["sbp", UNDERSCORE(), "short"].join("")), false);
});

test("hasSecretLikePattern is true for runtime-built telegram / xai / sbp tokens", () => {
  assert.equal(hasSecretLikePattern(telegramLike()), true);
  assert.equal(hasSecretLikePattern(xaiLike()), true);
  assert.equal(hasSecretLikePattern(sbpLike()), true);
  assert.equal(hasSecretLikePattern(`prefix ${telegramLike()} suffix`), true);
});

test("hasSecretLikePattern ignores postgres placeholder passwords and flags real ones", () => {
  assert.equal(hasSecretLikePattern(postgresUrl("app", "password")), false);
  assert.equal(hasSecretLikePattern(postgresUrl("app", "changeme")), false);
  assert.equal(hasSecretLikePattern(postgresUrl("app", "xxx")), false);
  assert.equal(hasSecretLikePattern(postgresUrl("app", "your_password")), false);
  assert.equal(hasSecretLikePattern(["postgres", COLON(), SLASH(), SLASH(), "localhost/db"].join("")), false);
  assert.equal(hasSecretLikePattern(postgresUrl("u", "s3cretValue")), true);
});

test("findSecretLikePaths reports paths only and never the matched value", () => {
  const tok = telegramLike();
  const files = {
    "src/ok.ts": "export const x = 1;",
    "leak.txt": tok,
  };
  const hits = findSecretLikePaths(Object.keys(files), (p) => files[p] ?? "");
  assert.deepEqual(hits, ["leak.txt"]);
  assert.equal(hits.includes(tok), false);
  assert.equal(hits.some((p) => hasSecretLikePattern(p)), false);
});

test("findSecretLikePaths skips node_modules, .git, and lockfiles", () => {
  const tok = telegramLike();
  const paths = [
    "node_modules/pkg/secret.js",
    "src/node_modules/hidden.js",
    ".git/config",
    "package-lock.json",
    "pnpm-lock.yaml.lock",
    "src/app.ts",
  ];
  const hits = findSecretLikePaths(paths, () => tok);
  assert.deepEqual(hits, ["src/app.ts"]);
});
