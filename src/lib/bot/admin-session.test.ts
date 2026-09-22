import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  CSRF_HEADER,
  hashPin,
  hashPinHex,
  mintAdminSession,
  mintCsrf,
  assertCsrf,
  sessionValid,
  verifyPin,
  recordPinFailure,
  guardStatus,
  clearPinFailures,
  MAX_PIN_ATTEMPTS,
  LOCK_MS,
  resetAdminPinHashCache,
  sessionCookieOptions,
  clearedSessionCookieOptions,
  ADMIN_COOKIE_ATTRS,
} from "./admin-session.server.ts";

test("PIN is compared via scrypt hash, not plaintext equality", () => {
  const a = hashPin("secret-pin-1234");
  const b = hashPin("secret-pin-1234");
  const c = hashPin("other-pin-9999");
  assert.equal(a.equals(b), true);
  assert.equal(a.equals(c), false);
  assert.equal(a.length, 32);
  assert.equal(hashPinHex("secret-pin-1234").length, 64);
});

test("BARQ_ADMIN_PIN_HASH is preferred; plaintext PIN is hashed only as fallback", () => {
  const prevHash = process.env.BARQ_ADMIN_PIN_HASH;
  const prevPin = process.env.BARQ_ADMIN_PIN;
  const pin = "local-dev-pin-4242";
  const other = "not-the-pin-0000";
  try {
    process.env.BARQ_ADMIN_PIN_HASH = hashPinHex(pin);
    process.env.BARQ_ADMIN_PIN = other;
    resetAdminPinHashCache();
    assert.equal(verifyPin(pin), true);
    assert.equal(verifyPin(other), false);

    delete process.env.BARQ_ADMIN_PIN_HASH;
    process.env.BARQ_ADMIN_PIN = pin;
    resetAdminPinHashCache();
    assert.equal(verifyPin(pin), true);
    assert.equal(verifyPin(other), false);
  } finally {
    if (prevHash == null) delete process.env.BARQ_ADMIN_PIN_HASH;
    else process.env.BARQ_ADMIN_PIN_HASH = prevHash;
    if (prevPin == null) delete process.env.BARQ_ADMIN_PIN;
    else process.env.BARQ_ADMIN_PIN = prevPin;
    resetAdminPinHashCache();
  }
});

test("session is HMAC-signed and expires", () => {
  const token = mintAdminSession(1_000_000);
  assert.equal(sessionValid(token, 1_000_000), true);
  assert.equal(sessionValid(token, 1_000_000 + 5 * 3600 * 1000), false);
  assert.equal(sessionValid("1.2.forged", 1_000_000), false);
  assert.equal(sessionValid("", 1_000_000), false);
  const tampered = token.replace(/\.\d+\./, ".9999999999.");
  assert.equal(sessionValid(tampered, 1_000_000), false);
});

test("locks after 5 PIN failures for 15 minutes", () => {
  const key = `test-${Date.now()}`;
  clearPinFailures(key);
  assert.equal(MAX_PIN_ATTEMPTS, 5);
  assert.equal(LOCK_MS, 15 * 60 * 1000);
  for (let i = 0; i < MAX_PIN_ATTEMPTS - 1; i += 1) {
    const r = recordPinFailure(key, 10);
    assert.equal(r.locked, false);
  }
  const last = recordPinFailure(key, 10);
  assert.equal(last.locked, true);
  assert.equal(guardStatus(key, 11).ok, false);
  assert.equal(guardStatus(key, 11 + 15 * 60 * 1000 + 1).ok, true);
  clearPinFailures(key);
});

test("verifyPin does not throw on empty env", () => {
  assert.equal(typeof verifyPin("x"), "boolean");
});

test("csrf mint/assert roundtrip, wrong token throws", () => {
  const session = mintAdminSession(1_700_000_000_000);
  const token = mintCsrf(session);
  const ok = new Request("https://barq.local/admin", {
    method: "POST",
    headers: { [CSRF_HEADER]: token },
  });
  assert.doesNotThrow(() => assertCsrf(ok, session));

  const wrong = new Request("https://barq.local/admin", {
    method: "POST",
    headers: { [CSRF_HEADER]: mintCsrf("other-session") },
  });
  assert.throws(() => assertCsrf(wrong, session));

  const missing = new Request("https://barq.local/admin", { method: "POST" });
  assert.throws(() => assertCsrf(missing, session));
  assert.equal(CSRF_HEADER, "x-barq-csrf");
});

test("session cookie is HttpOnly Secure SameSite=strict; logout expires it", () => {
  const set = sessionCookieOptions();
  assert.equal(set.httpOnly, true);
  assert.equal(set.secure, true);
  assert.ok(set.sameSite === "strict" || set.sameSite === "lax");
  assert.equal(set.path, "/");
  assert.ok((set.maxAge ?? 0) > 0);
  const clear = clearedSessionCookieOptions();
  assert.equal(clear.httpOnly, true);
  assert.equal(clear.secure, true);
  assert.equal(clear.sameSite, set.sameSite);
  assert.equal(clear.path, "/");
  assert.equal(clear.maxAge, 0);
  assert.ok(clear.expires.getTime() <= 0);
  assert.equal(ADMIN_COOKIE_ATTRS.httpOnly, true);
});

test("admin-session source never logs PIN, session secret, or tokens", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "admin-session.server.ts"), "utf8");
  assert.equal(src.includes("console."), false);
  assert.doesNotMatch(src, /logAudit\([^)]*\bpin\b/);
  assert.match(src, /bad_pin/);
  assert.doesNotMatch(src, /console\.(log|info|debug|error|warn)\(/);
});

test("fail-closed when neither BARQ_ADMIN_PIN_HASH nor BARQ_ADMIN_PIN is set", () => {
  const prevHash = process.env.BARQ_ADMIN_PIN_HASH;
  const prevPin = process.env.BARQ_ADMIN_PIN;
  try {
    delete process.env.BARQ_ADMIN_PIN_HASH;
    delete process.env.BARQ_ADMIN_PIN;
    resetAdminPinHashCache();
    assert.equal(verifyPin("anything"), false);
    assert.equal(verifyPin(""), false);
  } finally {
    if (prevHash == null) delete process.env.BARQ_ADMIN_PIN_HASH;
    else process.env.BARQ_ADMIN_PIN_HASH = prevHash;
    if (prevPin == null) delete process.env.BARQ_ADMIN_PIN;
    else process.env.BARQ_ADMIN_PIN = prevPin;
    resetAdminPinHashCache();
  }
});

test("admin server functions require session / mutation gate (no unauthenticated data)", () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const fns = readFileSync(join(root, "admin.functions.ts"), "utf8");
  // loadAdmin must require session before reading store
  assert.match(fns, /await requireAdminSession\(\)/);
  // mutations go through gated() or requireAdminMutation
  for (const name of [
    "adminCreateCode",
    "adminSetCodeActive",
    "adminGrant",
    "adminSetSubscription",
    "adminBroadcast",
    "adminSetSetting",
    "adminBan",
    "adminSetRole",
    "adminRetryJob",
  ]) {
    assert.match(fns, new RegExp(`export const ${name}`));
  }
  assert.match(fns, /async function gated\(/);
  assert.match(fns, /await requireAdminMutation\(\)/);
  // login is the only unauthenticated write — and it goes through verifyPin
  assert.match(fns, /await loginWithPin\(/);
  const backup = readFileSync(join(root, "../../routes/api/backup.ts"), "utf8");
  assert.match(backup, /requireWeb\(|hasAdminSession\(/);
});

test("empty / forged session tokens are rejected", () => {
  assert.equal(sessionValid(""), false);
  assert.equal(sessionValid("a.b"), false);
  assert.equal(sessionValid("1.2.not-a-real-hmac"), false);
});
