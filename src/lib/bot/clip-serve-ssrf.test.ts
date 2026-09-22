import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { assertPublicHttpUrl, assertSafeOutboundUrl, SsrfError } from "../media/ssrf.ts";
import { isHostedMediaCdn } from "../media/http.ts";
import { CLIP_NOT_FOUND_BODY, clipNotFoundResponse } from "./clip-serve.server.ts";

test("/d/{id} route delegates to serveClipById with clip-id check", () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const route = readFileSync(join(root, "../../routes/d.$id.ts"), "utf8");
  assert.match(route, /createFileRoute\("\/d\/\$id"\)/);
  assert.match(route, /serveClipById/);
  assert.match(route, /isClipId/);
});

test("clip-serve proxy path uses assertSafeOutboundUrl + safeFetch (not bare fetch)", () => {
  const src = readFileSync(new URL("./clip-serve.server.ts", import.meta.url), "utf8");
  assert.match(src, /assertSafeOutboundUrl/);
  assert.match(src, /safeFetch/);
  assert.match(src, /SsrfError/);
  assert.match(src, /isHostedMediaCdn/);
  // Bare fetch on media_url would follow redirects without SSRF re-check.
  assert.doesNotMatch(src, /await fetch\(url/);
  assert.doesNotMatch(src, /fetch\(clip\.media_url/);
});

test("SSRF: private / metadata / file URLs rejected for /d proxy candidates", async () => {
  const blocked = [
    "http://127.0.0.1/secret.mp4",
    "http://localhost/x.mp4",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.8/clip.mp4",
    "http://192.168.1.1/a.mp4",
    "file:///etc/passwd",
  ];
  for (const url of blocked) {
    assert.throws(() => assertPublicHttpUrl(url), SsrfError, url);
    await assert.rejects(() => assertSafeOutboundUrl(url), SsrfError);
    assert.equal(isHostedMediaCdn(url), false, url);
  }
});

test("SSRF: non-CDN public hosts are not proxied by /d", () => {
  assert.equal(isHostedMediaCdn("https://evil.example/video.twimg.com/x.mp4"), false);
  assert.equal(isHostedMediaCdn("https://example.com/video.mp4"), false);
  assert.equal(isHostedMediaCdn("https://video.twimg.com/amplify_video/1/vid/x.mp4"), true);
});

test("clip not-found response is opaque (no storage leak)", () => {
  const res = clipNotFoundResponse();
  assert.equal(res.status, 404);
  assert.equal(CLIP_NOT_FOUND_BODY, "Not Found");
});
