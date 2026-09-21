import { timingSafeEqual } from "node:crypto";
import type { TgUpdate } from "./telegram.server";

export type GuardOk = { ok: true; update: TgUpdate };
export type GuardErr = { ok: false; status: number; body: string };
export type GuardResult = GuardOk | GuardErr;

/** Telegram secret-token header. Never log this header's value. */
export const TELEGRAM_WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token";

export function webhookSecret(): string {
  if (typeof process === "undefined") return "";
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
}

/**
 * Constant-time compare of request token vs configured secret.
 * Empty configured secret never matches (fail closed), including an empty header.
 * Always runs timingSafeEqual on equal-length padded buffers — do not short-circuit
 * on length. Never log `got` or `want`.
 */
export function secretsMatch(got: string, want: string): boolean {
  if (!want) return false;
  const a = Buffer.from(got, "utf8");
  const b = Buffer.from(want, "utf8");
  const n = Math.max(a.length, b.length, 1);
  const x = Buffer.alloc(n);
  const y = Buffer.alloc(n);
  a.copy(x);
  b.copy(y);
  const sameBytes = timingSafeEqual(x, y);
  const sameLen = a.length === b.length;
  return sameBytes && sameLen;
}

export function contentTypeIsJson(value: string | null): boolean {
  if (!value) return false;
  return value.toLowerCase().split(";")[0]!.trim() === "application/json";
}

export function isTgUpdate(value: unknown): value is TgUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const id = (value as { update_id?: unknown }).update_id;
  return typeof id === "number" && Number.isInteger(id);
}

export function guardTelegramRequest(request: Request, rawBody: string): GuardResult {
  if (request.method.toUpperCase() !== "POST") {
    return { ok: false, status: 405, body: "method not allowed" };
  }
  const want = webhookSecret();
  const got = request.headers.get(TELEGRAM_WEBHOOK_SECRET_HEADER) ?? "";
  if (!secretsMatch(got, want)) {
    return { ok: false, status: 403, body: "forbidden" };
  }
  if (!contentTypeIsJson(request.headers.get("content-type"))) {
    // Telegram usually sends JSON; allow missing type if the body is a valid update.
    if (request.headers.get("content-type")) {
      return { ok: false, status: 415, body: "unsupported media type" };
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, body: "bad json" };
  }
  if (!isTgUpdate(parsed)) {
    return { ok: false, status: 400, body: "invalid update" };
  }
  return { ok: true, update: parsed };
}
