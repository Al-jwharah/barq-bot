import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import {
  TELEGRAM_WEBHOOK_SECRET_HEADER,
  contentTypeIsJson,
  guardTelegramRequest,
  isTgUpdate,
  secretsMatch,
  webhookSecret,
} from "./webhook-guard.ts";

afterEach(() => {
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

function req(init: { method?: string; secret?: string | null; type?: string | null; body: string }) {
  const headers = new Headers();
  if (init.type !== null) headers.set("content-type", init.type ?? "application/json");
  if (init.secret !== null && init.secret !== undefined) {
    headers.set(TELEGRAM_WEBHOOK_SECRET_HEADER, init.secret);
  }
  return new Request("https://example.test/api/telegram", {
    method: init.method ?? "POST",
    headers,
    body: init.body,
  });
}

test("good secret: accepts a valid POST and returns the update", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "tok_abc";
  const body = JSON.stringify({ update_id: 42, message: { text: "hi" } });
  const result = guardTelegramRequest(req({ secret: "tok_abc", body }), body);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.update.update_id, 42);
});

test("bad secret: 403 and body never contains the configured or sent secret", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "tok_abc";
  const result = guardTelegramRequest(
    req({ secret: "nope", body: JSON.stringify({ update_id: 1 }) }),
    JSON.stringify({ update_id: 1 }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.body, "forbidden");
    assert.equal(result.body.includes("tok_abc"), false);
    assert.equal(result.body.includes("nope"), false);
  }
});

test("missing secret header: 403", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "tok_abc";
  const result = guardTelegramRequest(
    req({ secret: null, body: JSON.stringify({ update_id: 1 }) }),
    JSON.stringify({ update_id: 1 }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
});

test("GET: 405", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "tok_abc";
  const headers = new Headers({
    "content-type": "application/json",
    [TELEGRAM_WEBHOOK_SECRET_HEADER]: "tok_abc",
  });
  const result = guardTelegramRequest(
    new Request("https://example.test/api/telegram", { method: "GET", headers }),
    JSON.stringify({ update_id: 1 }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 405);
});

test("HEAD: 405", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "tok_abc";
  const headers = new Headers({
    "content-type": "application/json",
    [TELEGRAM_WEBHOOK_SECRET_HEADER]: "tok_abc",
  });
  const result = guardTelegramRequest(
    new Request("https://example.test/api/telegram", { method: "HEAD", headers }),
    "",
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 405);
    assert.equal(result.body, "method not allowed");
  }
});

test("bad content-type: 415", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "tok_abc";
  const result = guardTelegramRequest(
    req({ secret: "tok_abc", type: "text/plain", body: "x" }),
    "x",
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 415);
});

test("invalid json: 400 without throwing", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "tok_abc";
  const result = guardTelegramRequest(req({ secret: "tok_abc", body: "{nope" }), "{nope");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("missing update_id: 400", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "tok_abc";
  const result = guardTelegramRequest(
    req({ secret: "tok_abc", body: JSON.stringify({ message: {} }) }),
    JSON.stringify({ message: {} }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("webhookSecret reads env and is never logged by the guard", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "barq_secret_token_value";
  assert.equal(webhookSecret(), "barq_secret_token_value");
});

test("secretsMatch is length-safe and does not short-circuit before timingSafeEqual", () => {
  assert.equal(secretsMatch("abc", "abc"), true);
  assert.equal(secretsMatch("abc", "abd"), false);
  assert.equal(secretsMatch("ab", "abc"), false);
  assert.equal(secretsMatch("abcd", "abc"), false);
  assert.equal(secretsMatch("", "x"), false);
  assert.equal(secretsMatch("x", ""), false);
  assert.equal(secretsMatch("", ""), false);
});

test("unset webhook secret rejects every request including empty header", () => {
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  assert.equal(webhookSecret(), "");
  const empty = guardTelegramRequest(
    req({ secret: "", body: JSON.stringify({ update_id: 1 }) }),
    JSON.stringify({ update_id: 1 }),
  );
  const missing = guardTelegramRequest(
    req({ secret: null, body: JSON.stringify({ update_id: 1 }) }),
    JSON.stringify({ update_id: 1 }),
  );
  assert.equal(empty.ok, false);
  assert.equal(missing.ok, false);
  if (!empty.ok) assert.equal(empty.status, 403);
  if (!missing.ok) assert.equal(missing.status, 403);
});

test("wrong secret wins over bad json: 403, body stays generic", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "super-secret-value";
  const result = guardTelegramRequest(req({ secret: "wrong-secret", type: "text/plain", body: "{nope" }), "{nope");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.body, "forbidden");
    assert.equal(result.body.includes("super-secret-value"), false);
    assert.equal(result.body.includes("wrong-secret"), false);
  }
});

test("secret prefix or padding mismatch is 403 and body stays generic", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "super-secret-value";
  for (const secret of ["super-secret-valueX", "super-secret", "SUPER-SECRET-VALUE"]) {
    const result = guardTelegramRequest(
      req({ secret, body: JSON.stringify({ update_id: 9 }) }),
      JSON.stringify({ update_id: 9 }),
    );
    assert.equal(result.ok, false, secret);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body, "forbidden");
      assert.equal(result.body.includes("super-secret"), false);
    }
  }
});

test("accepts application/json with charset and mixed case", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "tok_abc";
  const result = guardTelegramRequest(
    req({
      secret: "tok_abc",
      type: "Application/JSON; charset=utf-8",
      body: JSON.stringify({ update_id: 7 }),
    }),
    JSON.stringify({ update_id: 7 }),
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.update.update_id, 7);
});

test("rejects missing content-type, jsonp, PUT, and non-integer update_id", () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "tok_abc";
  const missingType = guardTelegramRequest(
    req({ secret: "tok_abc", type: null, body: JSON.stringify({ update_id: 1 }) }),
    JSON.stringify({ update_id: 1 }),
  );
  assert.equal(missingType.ok, false);
  if (!missingType.ok) assert.equal(missingType.status, 415);

  const jsonp = guardTelegramRequest(
    req({ secret: "tok_abc", type: "application/jsonp", body: JSON.stringify({ update_id: 1 }) }),
    JSON.stringify({ update_id: 1 }),
  );
  assert.equal(jsonp.ok, false);
  if (!jsonp.ok) assert.equal(jsonp.status, 415);

  const put = guardTelegramRequest(
    req({ method: "PUT", secret: "tok_abc", body: JSON.stringify({ update_id: 1 }) }),
    JSON.stringify({ update_id: 1 }),
  );
  assert.equal(put.ok, false);
  if (!put.ok) {
    assert.equal(put.status, 405);
    assert.equal(put.body, "method not allowed");
  }

  const stringId = guardTelegramRequest(
    req({ secret: "tok_abc", body: JSON.stringify({ update_id: "1" }) }),
    JSON.stringify({ update_id: "1" }),
  );
  assert.equal(stringId.ok, false);
  if (!stringId.ok) assert.equal(stringId.status, 400);

  const floatId = guardTelegramRequest(
    req({ secret: "tok_abc", body: JSON.stringify({ update_id: 1.5 }) }),
    JSON.stringify({ update_id: 1.5 }),
  );
  assert.equal(floatId.ok, false);
  if (!floatId.ok) assert.equal(floatId.status, 400);
});

test("contentTypeIsJson and isTgUpdate are strict", () => {
  assert.equal(contentTypeIsJson("application/json"), true);
  assert.equal(contentTypeIsJson("application/json; charset=utf-8"), true);
  assert.equal(contentTypeIsJson(null), false);
  assert.equal(contentTypeIsJson(""), false);
  assert.equal(contentTypeIsJson("text/json"), false);
  assert.equal(isTgUpdate({ update_id: 1 }), true);
  assert.equal(isTgUpdate({ update_id: 0 }), true);
  assert.equal(isTgUpdate({ update_id: Number.NaN }), false);
  assert.equal(isTgUpdate({ update_id: Infinity }), false);
  assert.equal(isTgUpdate({ update_id: 1.5 }), false);
  assert.equal(isTgUpdate({ update_id: "1" }), false);
  assert.equal(isTgUpdate(null), false);
  assert.equal(isTgUpdate([]), false);
  assert.equal(secretsMatch("", ""), false);
});

test("guard and webhook files never log the secret or the telegram secret header value", () => {
  const files = [
    "src/lib/bot/webhook-guard.ts",
    "src/lib/bot/webhook.server.ts",
    "src/routes/api/telegram.ts",
  ];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    assert.equal(/console\.(log|info|debug|error|warn)\(/.test(src), false, file);
    assert.equal(src.includes("TELEGRAM_WEBHOOK_SECRET}"), false, file);
    assert.equal(/headers\.get\([^)]*\)\s*[+,]/.test(src), false, file);
  }
});

test("webhook handler enqueues only and does not import yt-dlp or ffmpeg", () => {
  const route = readFileSync("src/routes/api/telegram.ts", "utf8");
  assert.match(route, /later\(/);
  assert.match(route, /handleUpdate/);
  assert.match(route, /drainJobs/);
  assert.match(route, /return new Response\("ok"\)/);
  assert.equal(/from ["'][^"']*(ytdlp|ffmpeg)|spawn\(["'](ffmpeg|yt-dlp)/i.test(route), false);

  assert.equal(route.includes("processed_updates"), false);

  const webhook = readFileSync("src/lib/bot/webhook.server.ts", "utf8");
  assert.match(webhook, /TELEGRAM_WEBHOOK_SECRET is required/);
  assert.equal(/from ["'][^"']*(ytdlp|ffmpeg)|spawn\(["'](ffmpeg|yt-dlp)/i.test(webhook), false);
  assert.equal(webhook.includes("secret || undefined"), false);
});

