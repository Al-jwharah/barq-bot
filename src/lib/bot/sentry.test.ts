import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captureError,
  initSentry,
  parseSentryDsn,
  resetSentryForTests,
  sentryEnabled,
} from "./sentry.server.ts";

test("parseSentryDsn accepts valid DSN and rejects junk", () => {
  const ok = parseSentryDsn("https://abc123@o99.ingest.sentry.io/456");
  assert.deepEqual(ok, { publicKey: "abc123", host: "o99.ingest.sentry.io", projectId: "456" });
  assert.equal(parseSentryDsn(""), null);
  assert.equal(parseSentryDsn("not-a-url"), null);
  assert.equal(parseSentryDsn("https://@host/1"), null);
});

test("initSentry and captureError are no-ops without SENTRY_DSN", async () => {
  resetSentryForTests();
  const prev = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  try {
    assert.equal(initSentry(), false);
    assert.equal(sentryEnabled(), false);
    await captureError(new Error("boom"), "unit");
  } finally {
    if (prev === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = prev;
    resetSentryForTests();
  }
});

test("captureError POSTs to Sentry store when DSN is set", async () => {
  resetSentryForTests();
  const prev = process.env.SENTRY_DSN;
  process.env.SENTRY_DSN = "https://pubkey@o1.ingest.sentry.io/99";
  const calls: { url: string; auth: string; body: string }[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      auth: String((init?.headers as Record<string, string>)?.["X-Sentry-Auth"] ?? ""),
      body: String(init?.body ?? ""),
    });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(initSentry(), true);
    assert.equal(sentryEnabled(), true);
    await captureError(new Error("unit fail"), "status");
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/api\/99\/store\/$/);
    assert.match(calls[0]!.auth, /sentry_key=pubkey/);
    assert.match(calls[0]!.body, /unit fail/);
    assert.match(calls[0]!.body, /"ctx":"status"/);
  } finally {
    globalThis.fetch = origFetch;
    if (prev === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = prev;
    resetSentryForTests();
  }
});
