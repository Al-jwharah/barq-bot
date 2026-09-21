import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { ADMIN_LOCK_MINUTES, ADMIN_MAX_LOGIN_ATTEMPTS, jobSecret } from "./config.server";

export const ADMIN_COOKIE = "barq_admin";
export const SESSION_TTL_SEC = 4 * 60 * 60;
export const MAX_PIN_ATTEMPTS = ADMIN_MAX_LOGIN_ATTEMPTS;
export const LOCK_MS = ADMIN_LOCK_MINUTES * 60 * 1000;
export const CSRF_HEADER = "x-barq-csrf";

const SALT = "barq-admin-pin-v1";
const HASH_HEX_RE = /^[a-f0-9]{64}$/i;

export const ADMIN_COOKIE_ATTRS = {
  path: "/",
  httpOnly: true as const,
  secure: true as const,
  sameSite: "strict" as const,
};

export function sessionCookieOptions(maxAge = SESSION_TTL_SEC) {
  return { ...ADMIN_COOKIE_ATTRS, maxAge };
}

export function clearedSessionCookieOptions() {
  return { ...ADMIN_COOKIE_ATTRS, maxAge: 0, expires: new Date(0) };
}

export function hashPin(pin: string): Buffer {
  return scryptSync(pin.normalize("NFKC").trim(), SALT, 32, { N: 16384, r: 8, p: 1 });
}

export function hashPinHex(pin: string): string {
  return hashPin(pin).toString("hex");
}

let expected: Buffer | null | undefined;

/** Test helper — drop the cached expected hash after mutating env. */
export function resetAdminPinHashCache() {
  expected = undefined;
}

function readHashEnv(): string {
  if (typeof process === "undefined") return "";
  return process.env.BARQ_ADMIN_PIN_HASH?.trim() ?? "";
}

function readPinFallback(): string {
  // Local-dev only. Never log this value.
  if (typeof process === "undefined") return "";
  return process.env.BARQ_ADMIN_PIN?.trim() ?? "";
}

function expectedHash(): Buffer | null {
  if (expected !== undefined) return expected;
  const fromEnv = readHashEnv();
  if (fromEnv && HASH_HEX_RE.test(fromEnv)) {
    expected = Buffer.from(fromEnv, "hex");
    return expected;
  }
  const pin = readPinFallback();
  expected = pin ? hashPin(pin) : null;
  return expected;
}

function bufEq(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function strEq(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return bufEq(left, right);
}

export function verifyPin(pin: string): boolean {
  const want = expectedHash();
  if (!want) return false;
  return bufEq(hashPin(pin), want);
}

function sessionKey(): string {
  return `${jobSecret()}|admin-session`;
}

function csrfKey(): string {
  return `${jobSecret()}|admin-csrf`;
}

export function mintAdminSession(now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const exp = iat + SESSION_TTL_SEC;
  const payload = `${iat}.${exp}`;
  const sig = createHmac("sha256", sessionKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function sessionValid(token: string, now = Date.now()): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [iat, exp, sig] = parts;
  if (!iat || !exp || !sig) return false;
  if (!Number.isFinite(Number(iat)) || !Number.isFinite(Number(exp))) return false;
  const payload = `${iat}.${exp}`;
  const expect = createHmac("sha256", sessionKey()).update(payload).digest("base64url");
  if (!strEq(sig, expect)) return false;
  if (Number(exp) * 1000 < now) return false;
  return true;
}

/** HMAC of the admin session token — send as `x-barq-csrf` on mutations. */
export function mintCsrf(sessionToken: string): string {
  return createHmac("sha256", csrfKey()).update(sessionToken).digest("base64url");
}

export function assertCsrf(request: Request, sessionToken: string): void {
  const got = request.headers.get(CSRF_HEADER) ?? "";
  const want = mintCsrf(sessionToken);
  if (!strEq(got, want)) throw new Error("غير مصرح");
}

const memGuard = new Map<string, { fails: number; lockedUntil: number }>();

export function guardStatus(key: string, now = Date.now()): { ok: boolean; fails: number } {
  const cur = memGuard.get(key);
  if (!cur) return { ok: true, fails: 0 };
  if (cur.lockedUntil > now) return { ok: false, fails: cur.fails };
  if (cur.lockedUntil && cur.lockedUntil <= now) {
    memGuard.delete(key);
    return { ok: true, fails: 0 };
  }
  return { ok: true, fails: cur.fails };
}

export function recordPinFailure(key: string, now = Date.now()): { locked: boolean; fails: number } {
  const cur = memGuard.get(key) ?? { fails: 0, lockedUntil: 0 };
  cur.fails += 1;
  if (cur.fails >= MAX_PIN_ATTEMPTS) cur.lockedUntil = now + LOCK_MS;
  memGuard.set(key, cur);
  return { locked: cur.fails >= MAX_PIN_ATTEMPTS, fails: cur.fails };
}

export function clearPinFailures(key: string) {
  memGuard.delete(key);
}

async function clientKey(): Promise<string> {
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const xf = getRequestHeader("x-forwarded-for") ?? getRequestHeader("x-real-ip") ?? "local";
    return `admin-pin:${xf.split(",")[0]!.trim().slice(0, 64)}`;
  } catch {
    return "admin-pin:local";
  }
}

async function persistGuard(key: string, fails: number, lockedUntil: number) {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into rate_buckets (key, count, reset_at)
      values (${key}, ${fails}, ${new Date(lockedUntil || Date.now()).toISOString()})
      on conflict (key) do update set count = excluded.count, reset_at = excluded.reset_at
    `;
  } catch {
    /* memory fallback */
  }
}

async function loadGuard(key: string, now: number): Promise<{ ok: boolean; fails: number }> {
  const mem = guardStatus(key, now);
  if (!mem.ok) return mem;
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ count: number; reset_at: string }>`
      select count, reset_at from rate_buckets where key = ${key} limit 1
    `;
    const row = rows[0];
    if (!row) return mem;
    const until = Date.parse(String(row.reset_at));
    const fails = Number(row.count ?? 0);
    if (fails >= MAX_PIN_ATTEMPTS && Number.isFinite(until) && until > now) {
      memGuard.set(key, { fails, lockedUntil: until });
      return { ok: false, fails };
    }
    memGuard.set(key, { fails, lockedUntil: 0 });
    return { ok: true, fails };
  } catch {
    return mem;
  }
}

async function readAdminCookie(): Promise<string> {
  const { getCookie } = await import("@tanstack/react-start/server");
  return getCookie(ADMIN_COOKIE) ?? "";
}

export async function requireAdminSession(): Promise<void> {
  const token = await readAdminCookie();
  if (!sessionValid(token)) throw new Error("غير مصرح");
}

export async function requireAdminMutation(): Promise<void> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const token = await readAdminCookie();
  if (!sessionValid(token)) throw new Error("غير مصرح");
  let request: Request;
  try {
    request = getRequest();
  } catch {
    throw new Error("غير مصرح");
  }
  assertCsrf(request, token);
}

export async function loginWithPin(pin: string): Promise<void> {
  const key = await clientKey();
  const now = Date.now();
  const guard = await loadGuard(key, now);
  if (!guard.ok) throw new Error("محاولات كثيرة. أعد المحاولة بعد 15 دقيقة.");
  if (!verifyPin(pin)) {
    const next = recordPinFailure(key, now);
    await persistGuard(key, next.fails, next.locked ? now + LOCK_MS : 0);
    const { logAudit } = await import("./observability.server");
    await logAudit({ action: "admin_login_fail", detail: next.locked ? "locked" : "bad_pin" });
    throw new Error(next.locked ? "محاولات كثيرة. أعد المحاولة بعد 15 دقيقة." : "رمز غير صحيح");
  }
  clearPinFailures(key);
  await persistGuard(key, 0, 0);
  const { setCookie } = await import("@tanstack/react-start/server");
  setCookie(ADMIN_COOKIE, mintAdminSession(now), sessionCookieOptions());
  const { logAudit } = await import("./observability.server");
  await logAudit({ action: "admin_login" });
}

export async function clearAdminCookie(): Promise<void> {
  const opts = clearedSessionCookieOptions();
  const { setCookie, deleteCookie } = await import("@tanstack/react-start/server");
  try {
    deleteCookie(ADMIN_COOKIE, {
      path: opts.path,
      httpOnly: opts.httpOnly,
      secure: opts.secure,
      sameSite: opts.sameSite,
    });
  } catch {
    /* setCookie below still expires it */
  }
  setCookie(ADMIN_COOKIE, "", opts);
}

export async function logoutAdmin(): Promise<void> {
  const { getRequest } = await import("@tanstack/react-start/server");
  let token = "";
  try {
    token = await readAdminCookie();
  } catch {
    token = "";
  }
  if (token && sessionValid(token)) {
    let request: Request;
    try {
      request = getRequest();
    } catch {
      throw new Error("غير مصرح");
    }
    assertCsrf(request, token);
  }
  await clearAdminCookie();
  const { logAudit } = await import("./observability.server");
  await logAudit({ action: "admin_logout" });
}

export async function hasAdminSession(): Promise<boolean> {
  try {
    return sessionValid(await readAdminCookie());
  } catch {
    return false;
  }
}
