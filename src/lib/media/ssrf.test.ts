import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertPublicHttpUrl,
  assertPublicRedirect,
  assertSafeOutboundUrl,
  isBlockedIp,
  isPrivateHost,
  MAX_REDIRECTS,
  pickPublicIps,
  safeFetch,
  SsrfError,
} from "./ssrf.ts";

test("rejects file, data, javascript, ftp, and localhost URLs", () => {
  const blocked = [
    "file:///etc/passwd",
    "data:text/html,hi",
    "javascript:alert(1)",
    "ftp://example.com/a",
    "http://localhost/admin",
    "http://127.0.0.1/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/secrets",
    "http://192.168.1.1/",
    "http://172.16.0.2/",
    "http://metadata.google.internal/",
  ];
  for (const url of blocked) {
    assert.throws(() => assertPublicHttpUrl(url), SsrfError, url);
  }
});

test("allows public https hosts before DNS", () => {
  const url = assertPublicHttpUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(url.hostname, "www.youtube.com");
});

test("blocks private and link-local IPs", () => {
  assert.equal(isBlockedIp("127.0.0.1"), true);
  assert.equal(isBlockedIp("10.1.2.3"), true);
  assert.equal(isBlockedIp("192.168.0.10"), true);
  assert.equal(isBlockedIp("169.254.169.254"), true);
  assert.equal(isBlockedIp("172.31.255.1"), true);
  assert.equal(isBlockedIp("8.8.8.8"), false);
  assert.equal(isBlockedIp("1.1.1.1"), false);
  assert.equal(isPrivateHost("localhost"), true);
  assert.equal(isPrivateHost("youtube.com"), false);
});

test("dual-stack host stays allowed when at least one address is public", () => {
  assert.deepEqual(pickPublicIps(["8.8.8.8", "127.0.0.1"]), ["8.8.8.8"]);
  assert.deepEqual(pickPublicIps(["::1", "1.1.1.1"]), ["1.1.1.1"]);
  assert.deepEqual(pickPublicIps(["10.0.0.1", "127.0.0.1"]), []);
});

test("blocks RFC1918, loopback, link-local, metadata, and weird IPv4 forms", () => {
  for (const host of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.1",
    "169.254.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "localhost",
    "::1",
    "0:0:0:0:0:0:0:1",
    "0177.0.0.1",
    "0x7f000001",
    "2130706433",
    "127.1",
    "metadata.google.internal",
  ]) {
    assert.equal(isPrivateHost(host), true, host);
  }
});

test("assertSafeOutboundUrl rejects loopback without DNS", async () => {
  await assert.rejects(() => assertSafeOutboundUrl("http://127.0.0.1/"), SsrfError);
  await assert.rejects(() => assertSafeOutboundUrl("http://localhost/x"), SsrfError);
  await assert.rejects(() => assertSafeOutboundUrl("http://[::1]/"), SsrfError);
  await assert.rejects(() => assertSafeOutboundUrl("file:///etc/passwd"), SsrfError);
});

test("redirects to private/metadata hosts are rejected", () => {
  assert.throws(() => assertPublicRedirect("http://127.0.0.1/secret", "https://example.com/"), SsrfError);
  assert.throws(() => assertPublicRedirect("http://169.254.169.254/latest/meta-data/", "http://1.1.1.1/"), SsrfError);
  assert.throws(() => assertPublicRedirect("file:///etc/passwd", "https://example.com/"), SsrfError);
  assert.throws(() => assertPublicRedirect("//localhost/x", "https://example.com/a"), SsrfError);
  const ok = assertPublicRedirect("/next", "https://www.youtube.com/watch");
  assert.equal(ok.hostname, "www.youtube.com");
});

test("safeFetch refuses redirect to localhost/metadata and caps hops", async () => {
  const orig = globalThis.fetch;
  let hops = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    hops += 1;
    if (url.startsWith("http://8.8.8.8/meta")) {
      return new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      });
    }
    if (url.startsWith("http://1.1.1.1/")) {
      return new Response(null, {
        status: 302,
        headers: { location: `http://1.1.1.1/h${hops}` },
      });
    }
    if (url === "https://vt.tiktok.com/abc") {
      return new Response(null, {
        status: 301,
        headers: { location: "https://www.tiktok.com/@u/video/1234567890123456789" },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  try {
    await assert.rejects(() => safeFetch("http://8.8.8.8/meta"), SsrfError);
    hops = 0;
    await assert.rejects(() => safeFetch("http://1.1.1.1/start"), SsrfError);
    assert.ok(hops <= MAX_REDIRECTS + 1);
    const bounced = await safeFetch("https://vt.tiktok.com/abc", { maxRedirects: 0 });
    assert.equal(bounced.status, 301);
    assert.equal(
      bounced.headers.get("location"),
      "https://www.tiktok.com/@u/video/1234567890123456789",
    );
  } finally {
    globalThis.fetch = orig;
  }
});
