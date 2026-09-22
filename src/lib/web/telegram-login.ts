/**
 * Telegram Login Widget verification helpers (B2 scaffold).
 *
 * Owner ENV (propose only — set in Vercel dashboard / BotFather):
 *   TELEGRAM_BOT_TOKEN          — existing bot token (HMAC key material)
 *   BARQ_BOT_USERNAME           — widget data-telegram-login (default barq_ibot)
 *   BARQ_TELEGRAM_LOGIN_ENABLED — on/off gate (default off)
 *   BARQ_TELEGRAM_LOGIN_DOMAIN  — domain authorized in BotFather → /setdomain
 *   BARQ_TELEGRAM_LOGIN_MAX_AGE_SEC — auth_date skew (default 86400)
 *
 * BotFather steps: /setdomain → barq.abdulrhman.ai (or preview host for tests)
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type TelegramLoginPayload = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export function buildTelegramLoginCheckString(data: Record<string, string>): string {
  return Object.keys(data)
    .filter((k) => k !== "hash")
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");
}

export function verifyTelegramLoginHash(
  payload: TelegramLoginPayload,
  botToken: string,
  maxAgeSec = 86_400,
  nowSec = Math.floor(Date.now() / 1000),
): { ok: true; tgId: string } | { ok: false; reason: string } {
  if (!botToken) return { ok: false, reason: "missing_bot_token" };
  if (!payload?.id || !payload.hash || !payload.auth_date) {
    return { ok: false, reason: "incomplete_payload" };
  }
  if (Math.abs(nowSec - Number(payload.auth_date)) > maxAgeSec) {
    return { ok: false, reason: "auth_date_expired" };
  }
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === "hash" || v == null || v === "") continue;
    data[k] = String(v);
  }
  const check = buildTelegramLoginCheckString(data);
  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(check).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(String(payload.hash), "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "bad_hash" };
    }
  } catch {
    return { ok: false, reason: "bad_hash" };
  }
  return { ok: true, tgId: String(payload.id) };
}
