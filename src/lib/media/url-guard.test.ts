import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublicHttpUrl, SsrfError } from "./ssrf.ts";
import { DOWNLOAD_PLATFORMS, supportedDownloadPlatform } from "./urls.ts";

const SUPPORTED = new Set<string>([...DOWNLOAD_PLATFORMS, "direct"]);

function isUnsupported(url: string): boolean {
  const platform = supportedDownloadPlatform(url);
  return platform == null || !SUPPORTED.has(platform);
}

test("empty string is unsupported / not a download platform", () => {
  const platform = supportedDownloadPlatform("");
  assert.ok(platform == null || platform === "generic");
  assert.equal(isUnsupported(""), true);
  assert.equal(SUPPORTED.has(platform), false);
});

test('"not a url" is unsupported / not a download platform', () => {
  const platform = supportedDownloadPlatform("not a url");
  assert.ok(platform == null || platform === "generic");
  assert.equal(isUnsupported("not a url"), true);
  assert.equal(SUPPORTED.has(platform), false);
});

test("file data javascript ftp and localhost are not fetchable download targets", () => {
  const blocked = [
    "file:///etc/passwd",
    "data:text/html,hi",
    "javascript:alert(1)",
    "ftp://files.example.com/a.mp4",
    "http://localhost/video.mp4",
    "http://127.0.0.1/clip.mp4",
    "http://169.254.169.254/latest/meta-data/",
  ];
  for (const url of blocked) {
    assert.throws(() => assertPublicHttpUrl(url), SsrfError, url);
  }
});
