import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { test } from "node:test";
import {
  buildTelegramLoginCheckString,
  verifyTelegramLoginHash,
  type TelegramLoginPayload,
} from "./telegram-login.ts";

test("check string sorts keys excluding hash", () => {
  const s = buildTelegramLoginCheckString({
    hash: "x",
    id: "1",
    first_name: "A",
    auth_date: "100",
  });
  assert.equal(s, "auth_date=100\nfirst_name=A\nid=1");
});

test("verifyTelegramLoginHash accepts valid HMAC", () => {
  const token = "123456:AA-test-token";
  const auth_date = Math.floor(Date.now() / 1000);
  const fields: Record<string, string> = {
    id: "8471762251",
    first_name: "Owner",
    username: "barq_owner",
    auth_date: String(auth_date),
  };
  const check = buildTelegramLoginCheckString(fields);
  const secret = createHash("sha256").update(token).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  const payload: TelegramLoginPayload = {
    id: 8471762251,
    first_name: "Owner",
    username: "barq_owner",
    auth_date,
    hash,
  };
  const res = verifyTelegramLoginHash(payload, token, 86_400, auth_date);
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.tgId, "8471762251");
});

test("verifyTelegramLoginHash rejects bad hash and expired", () => {
  const bad = verifyTelegramLoginHash(
    { id: 1, auth_date: Math.floor(Date.now() / 1000), hash: "00" },
    "token",
  );
  assert.equal(bad.ok, false);
  const old = verifyTelegramLoginHash(
    { id: 1, auth_date: 1, hash: "00" },
    "token",
    60,
    10_000,
  );
  assert.equal(old.ok, false);
  if (!old.ok) assert.equal(old.reason, "auth_date_expired");
});
