import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateClipId } from "./clip-id.server.ts";
import {
  CLIP_TTL_MS,
  clipDeniedReason,
  clipExpiresAt,
  clipServeStatus,
  isClipId,
  toPublicClip,
} from "./clip-id.ts";

test("clip ids are 32-byte random base64url, not sequential", () => {
  const a = generateClipId();
  const b = generateClipId();
  assert.equal(a === b, false);
  assert.ok(Buffer.from(a, "base64url").length >= 32);
  assert.ok(a.length >= 43);
  assert.equal(isClipId(a), true);
  assert.equal(isClipId("1"), false);
  assert.equal(isClipId("00000001"), false);
  assert.equal(isClipId("../etc/passwd"), false);
});

test("isClipId rejects ../ and short ids", () => {
  assert.equal(isClipId("../"), false);
  assert.equal(isClipId("../etc/passwd"), false);
  assert.equal(isClipId("..\\windows"), false);
  assert.equal(isClipId("1"), false);
  assert.equal(isClipId("abc"), false);
  assert.equal(isClipId("short"), false);
});

test("generateClipId length >= 43 (32 bytes base64url)", () => {
  const id = generateClipId();
  assert.ok(id.length >= 43);
  assert.ok(Buffer.from(id, "base64url").length >= 32);
  assert.equal(isClipId(id), true);
});

test("isClipId rejects path traversal and sequential digits", () => {
  const traversal = [
    "../etc/passwd",
    "..\\windows\\system32",
    "....//....//etc/passwd",
    "%2e%2e/%2e%2e/etc/passwd",
    "..%2fetc%2fpasswd",
    "foo/../../etc/passwd",
    "/etc/passwd",
    "clips/../../../etc/passwd",
    "id\\..\\secret",
  ];
  for (const id of traversal) {
    assert.equal(isClipId(id), false, id);
    assert.equal(clipServeStatus(id, null), 404, id);
  }
  const sequential = ["1", "12", "12345678", "00000001", "1234567890123456789012345678901234567890123"];
  for (const id of sequential) {
    assert.equal(isClipId(id), false, id);
    assert.equal(clipServeStatus(id, { expires_at: clipExpiresAt() }), 404, id);
  }
});

test("expired, revoked, and unknown/guessed ids all 404 identically and never leak storage_key", () => {
  const id = generateClipId();
  const now = Date.parse("2026-09-21T00:00:00.000Z");
  const key = "barq-clips/secret-storage-key-must-not-leak";
  const freshExp = new Date(now + CLIP_TTL_MS).toISOString();

  const unknown = clipServeStatus(id, null, now);
  const expired = clipServeStatus(id, { expires_at: new Date(now - 1).toISOString(), storage_key: key }, now);
  const revoked = clipServeStatus(
    id,
    { expires_at: freshExp, revoked_at: new Date(now).toISOString(), storage_key: key },
    now,
  );
  const guess = clipServeStatus("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", null, now);
  const missingExp = clipServeStatus(id, { expires_at: null, storage_key: key }, now);

  assert.equal(unknown, 404);
  assert.equal(expired, 404);
  assert.equal(revoked, 404);
  assert.equal(guess, 404);
  assert.equal(missingExp, 404);
  assert.equal(unknown, expired);
  assert.equal(expired, revoked);
  assert.equal(revoked, guess);

  assert.equal(clipDeniedReason(null, now), "unknown");
  assert.equal(clipDeniedReason({ expires_at: new Date(now - 1).toISOString(), storage_key: key }, now), "expired");
  assert.equal(
    clipDeniedReason({ expires_at: freshExp, revoked_at: new Date(now).toISOString(), storage_key: key }, now),
    "revoked",
  );

  const alive = clipServeStatus(id, { expires_at: freshExp, storage_key: key }, now);
  assert.equal(alive, 200);

  const pub = toPublicClip({
    id,
    kind: "video",
    platform: "youtube",
    expires_at: freshExp,
    thumbnail: null,
    storage_key: key,
    media_url: "https://blob.vercel-storage.com/secret",
  });
  assert.equal("storage_key" in pub, false);
  assert.equal("media_url" in pub, false);
  const dumped = JSON.stringify(pub);
  assert.equal(dumped.includes(key), false);
  assert.equal(dumped.includes("storage_key"), false);
  assert.equal(dumped.includes("blob.vercel-storage.com"), false);
});

test("clip TTL is 24 hours; past TTL is expired", () => {
  assert.equal(CLIP_TTL_MS, 24 * 60 * 60 * 1000);
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  const exp = clipExpiresAt(now);
  assert.equal(Date.parse(exp) - now, CLIP_TTL_MS);
  const id = generateClipId();
  assert.equal(clipServeStatus(id, { expires_at: exp }, now), 200);
  assert.equal(clipServeStatus(id, { expires_at: exp }, now + CLIP_TTL_MS), 404);
  assert.equal(clipDeniedReason({ expires_at: exp }, now + CLIP_TTL_MS), "expired");
});

test("clip-serve 404 body is identical and never interpolates storage_key", () => {
  const src = readFileSync(new URL("./clip-serve.server.ts", import.meta.url), "utf8");
  assert.match(src, /CLIP_NOT_FOUND_BODY/);
  assert.match(src, /clipDeniedReason/);
  assert.match(src, /Not Found/);
  assert.equal(/new Response\([^)]*storage_key/.test(src), false);
  assert.equal(/CLIP_NOT_FOUND_BODY\s*=\s*clip/.test(src), false);
  const bodies = [...src.matchAll(/new Response\(\s*([^,\n]+)/g)].map((m) => m[1]!.trim());
  const notFoundBodies = bodies.filter((b) => /CLIP_NOT_FOUND_BODY|"Not Found"|"too many requests"/.test(b));
  assert.ok(notFoundBodies.length >= 1);
  for (const b of notFoundBodies) {
    assert.equal(b.includes("storage_key"), false, b);
  }
});
