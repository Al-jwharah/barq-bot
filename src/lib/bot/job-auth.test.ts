import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeJobRequest, legacyKeepProbeSecret } from "./job-auth.ts";

const SECRET = "unit-test-job-secret-xyz";

test("authorizeJobRequest accepts x-barq-job header", () => {
  process.env.BARQ_JOB_SECRET = SECRET;
  const req = new Request("https://example.test/api/jobs", {
    headers: { "x-barq-job": SECRET },
  });
  assert.equal(authorizeJobRequest(req), true);
});

test("authorizeJobRequest accepts query secret", () => {
  process.env.BARQ_JOB_SECRET = SECRET;
  const req = new Request(`https://example.test/api/keep?secret=${encodeURIComponent(SECRET)}`);
  assert.equal(authorizeJobRequest(req), true);
});

test("authorizeJobRequest accepts body secret", () => {
  process.env.BARQ_JOB_SECRET = SECRET;
  const req = new Request("https://example.test/api/jobs", { method: "POST" });
  assert.equal(authorizeJobRequest(req, SECRET), true);
});

test("authorizeJobRequest accepts Bearer token", () => {
  process.env.BARQ_JOB_SECRET = SECRET;
  const req = new Request("https://example.test/api/keep", {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  assert.equal(authorizeJobRequest(req), true);
});

test("authorizeJobRequest rejects wrong/missing secret", () => {
  process.env.BARQ_JOB_SECRET = SECRET;
  assert.equal(authorizeJobRequest(new Request("https://example.test/api/jobs")), false);
  assert.equal(
    authorizeJobRequest(
      new Request("https://example.test/api/jobs", { headers: { "x-barq-job": "nope" } }),
    ),
    false,
  );
  assert.equal(authorizeJobRequest(new Request("https://example.test/api/jobs"), "nope"), false);
});

test("legacyKeepProbeSecret matches probe query to job secret", () => {
  process.env.BARQ_JOB_SECRET = SECRET;
  assert.equal(
    legacyKeepProbeSecret(new Request(`https://example.test/api/keep?probe=${encodeURIComponent(SECRET)}`)),
    true,
  );
  assert.equal(legacyKeepProbeSecret(new Request("https://example.test/api/keep?probe=1")), false);
  assert.equal(legacyKeepProbeSecret(new Request("https://example.test/api/keep")), false);
});

test("authorizeJobRequest accepts Bearer CRON_SECRET when set", () => {
  process.env.BARQ_JOB_SECRET = SECRET;
  process.env.CRON_SECRET = "cron-only-secret-abc";
  const req = new Request("https://example.test/api/keep", {
    headers: { Authorization: "Bearer cron-only-secret-abc" },
  });
  assert.equal(authorizeJobRequest(req), true);
  assert.equal(
    authorizeJobRequest(
      new Request("https://example.test/api/keep", {
        headers: { Authorization: "Bearer nope-cron" },
      }),
    ),
    false,
  );
  delete process.env.CRON_SECRET;
});
