import assert from "node:assert/strict";
import { test } from "node:test";
import { makeJobKey } from "./job-key.ts";

/**
 * Simulated load harness. No Telegram network, no real DB.
 * Models concurrent job_key minting the queue would do before INSERT.
 *
 * Timings recorded here are in-process hashing latency, labeled
 * "simulated only". They are not production P95 and must not be cited
 * as 10/25/50 concurrent-user capacity.
 */

function simKey(userId: number | string, url: string): Promise<string> {
  return Promise.resolve(makeJobKey(userId, url));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[idx]!;
}

/**
 * In-process mint timings. Label is always "simulated only".
 */
function simulatedMintTimings(n: number): {
  n: number;
  label: "simulated only";
  samplesMs: number[];
  p50Ms: number;
  p95Ms: number;
} {
  const samplesMs: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const t0 = performance.now();
    makeJobKey(30_000 + i, `https://youtu.be/sim${String(i).padStart(4, "0")}`);
    samplesMs.push(performance.now() - t0);
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return {
    n,
    label: "simulated only",
    samplesMs,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
  };
}

test("10 concurrent same user+url collide to one job_key", async () => {
  const userId = 4242;
  const url = "https://youtu.be/dQw4w9WgXcQ?si=track";
  const keys = await Promise.all(Array.from({ length: 10 }, () => simKey(userId, url)));
  const unique = new Set(keys);
  assert.equal(keys.length, 10);
  assert.equal(unique.size, 1, "same user+url must mint one job_key under concurrent calls");
  assert.equal(keys[0], makeJobKey(userId, "https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
});

test("same user with different urls mints different keys", async () => {
  const userId = 4242;
  const urls = [
    "https://youtu.be/aaaaaaaaaaa",
    "https://www.youtube.com/watch?v=bbbbbbbbbbb",
    "https://www.tiktok.com/@u/video/1",
    "https://instagram.com/reel/xyz",
    "https://x.com/user/status/99",
    "https://vt.tiktok.com/ZSq7xKK2u",
    "https://www.instagram.com/p/abc123",
    "https://twitter.com/user/status/100",
    "https://youtu.be/ccccccccccc",
    "https://www.tiktok.com/@u/video/2",
  ];
  const keys = await Promise.all(urls.map((url) => simKey(userId, url)));
  assert.equal(keys.length, 10);
  assert.equal(new Set(keys).size, urls.length, "different urls must not collide");
});

test("simulates 25 unique job_keys with no real DB", async () => {
  const keys = await Promise.all(
    Array.from({ length: 25 }, (_, i) => simKey(1000 + i, `https://youtu.be/video${String(i).padStart(3, "0")}`)),
  );
  assert.equal(keys.length, 25);
  assert.equal(new Set(keys).size, 25);
  for (const key of keys) {
    assert.equal(typeof key, "string");
    assert.ok(key.length > 0);
  }
});

test("10 concurrent workers: collisions share a key, distinct urls stay unique", async () => {
  const sharedUser = 7;
  const sharedUrl = "https://www.youtube.com/watch?v=shared01&utm_source=tg";
  const collision = await Promise.all(Array.from({ length: 10 }, () => simKey(sharedUser, sharedUrl)));
  assert.equal(new Set(collision).size, 1);

  const mixed = await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      simKey(i < 10 ? sharedUser : 9000 + i, i < 10 ? sharedUrl : `https://instagram.com/reel/u${i}`),
    ),
  );
  const unique = new Set(mixed);
  assert.equal(mixed.length, 25);
  assert.equal(unique.size, 16, "10 collisions collapse to 1 key plus 15 distinct urls");
});

test("simulates 50 unique job_keys with no real DB", async () => {
  const keys = await Promise.all(
    Array.from({ length: 50 }, (_, i) => simKey(5000 + i, `https://www.tiktok.com/@u/video/${i}`)),
  );
  assert.equal(keys.length, 50);
  assert.equal(new Set(keys).size, 50);
});

test("simulated-only 10/25/50 in-process mint timings (not production P95)", () => {
  for (const n of [10, 25, 50]) {
    const result = simulatedMintTimings(n);
    assert.equal(result.label, "simulated only");
    assert.equal(result.n, n);
    assert.equal(result.samplesMs.length, n);
    assert.ok(result.p50Ms >= 0);
    assert.ok(result.p95Ms >= result.p50Ms);
    // Do not assert a production SLO. These numbers are CPU hashing only.
  }
});
