import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  getPublicOrigin,
  hostOf,
  internalOrigin,
  isPublicAbsoluteUrl,
  normalizeOrigin,
  publicUrl,
  requirePublicOrigin,
  shouldCanonicalRedirect,
  webhookUrl,
} from "./origin.ts";

const FORBIDDEN_HOSTS = ["barq-vid.vercel.app", "barq.abdulrhman.ai"];

afterEach(() => {
  delete process.env.BARQ_PUBLIC_ORIGIN;
  delete process.env.PUBLIC_ORIGIN;
  delete process.env.VERCEL_URL;
});

test("normalizeOrigin strips slash, www, and adds https", () => {
  assert.equal(normalizeOrigin("https://abdulrhman.ai/"), "https://abdulrhman.ai");
  assert.equal(normalizeOrigin("www.abdulrhman.ai"), "https://abdulrhman.ai");
  assert.equal(normalizeOrigin("https://www.abdulrhman.ai/path"), "https://abdulrhman.ai");
  assert.equal(normalizeOrigin(""), "");
});

test("all public URLs come from BARQ_PUBLIC_ORIGIN", () => {
  process.env.BARQ_PUBLIC_ORIGIN = "https://abdulrhman.ai";
  assert.equal(getPublicOrigin(), "https://abdulrhman.ai");
  assert.equal(requirePublicOrigin(), "https://abdulrhman.ai");
  assert.equal(publicUrl("/d/abc"), "https://abdulrhman.ai/d/abc");
  assert.equal(publicUrl("/api/telegram"), "https://abdulrhman.ai/api/telegram");
  assert.equal(webhookUrl(), "https://abdulrhman.ai/api/telegram");
  assert.equal(publicUrl("/bot-intro.mp4"), "https://abdulrhman.ai/bot-intro.mp4");
  assert.equal(publicUrl("/s/xyz"), "https://abdulrhman.ai/s/xyz");
  assert.equal(isPublicAbsoluteUrl("https://abdulrhman.ai/d/1"), true);
  assert.equal(isPublicAbsoluteUrl("https://barq-vid.vercel.app/d/1"), false);
});

test("current production origin is the barq subdomain via env only", () => {
  process.env.BARQ_PUBLIC_ORIGIN = "https://barq.abdulrhman.ai";
  assert.equal(getPublicOrigin(), "https://barq.abdulrhman.ai");
  assert.equal(requirePublicOrigin(), "https://barq.abdulrhman.ai");
  assert.equal(webhookUrl(), "https://barq.abdulrhman.ai/api/telegram");
  assert.equal(publicUrl("/s/xyz"), "https://barq.abdulrhman.ai/s/xyz");
  assert.equal(shouldCanonicalRedirect("www.barq.abdulrhman.ai"), "https://barq.abdulrhman.ai");
  assert.equal(shouldCanonicalRedirect("barq.abdulrhman.ai"), null);
});

test("PUBLIC_ORIGIN is an alias when BARQ_PUBLIC_ORIGIN is empty", () => {
  process.env.PUBLIC_ORIGIN = "https://abdulrhman.ai";
  assert.equal(getPublicOrigin(), "https://abdulrhman.ai");
});

test("BARQ_PUBLIC_ORIGIN wins over PUBLIC_ORIGIN", () => {
  process.env.BARQ_PUBLIC_ORIGIN = "https://abdulrhman.ai";
  process.env.PUBLIC_ORIGIN = "https://example.com";
  assert.equal(getPublicOrigin(), "https://abdulrhman.ai");
});

test("www host redirects to public origin", () => {
  process.env.BARQ_PUBLIC_ORIGIN = "https://abdulrhman.ai";
  assert.equal(shouldCanonicalRedirect("www.abdulrhman.ai"), "https://abdulrhman.ai");
  assert.equal(shouldCanonicalRedirect("abdulrhman.ai"), null);
  assert.equal(hostOf("https://abdulrhman.ai"), "abdulrhman.ai");
});

test("internalOrigin uses VERCEL_URL and is not a public brand link", () => {
  process.env.BARQ_PUBLIC_ORIGIN = "https://abdulrhman.ai";
  process.env.VERCEL_URL = "barq-vid-abc.vercel.app";
  assert.equal(internalOrigin(), "https://barq-vid-abc.vercel.app");
  assert.notEqual(internalOrigin(), getPublicOrigin());
});

test("requirePublicOrigin fails without env", () => {
  assert.throws(() => requirePublicOrigin(), /BARQ_PUBLIC_ORIGIN/);
});

test("bot and job sources do not hardcode public hosts", () => {
  const roots = ["src/lib/bot", "src/lib/jobs", "src/routes", "server/middleware"];
  const files: string[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|mjs)$/.test(name) && !name.includes(".test.")) files.push(p);
    }
  }
  for (const root of roots) walk(root);
  const hits: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const host of FORBIDDEN_HOSTS) {
      if (src.includes(host)) hits.push(`${file}: ${host}`);
    }
  }
  assert.deepEqual(hits, []);
});
