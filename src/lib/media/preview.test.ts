import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBytes, formatDuration, platformLabelAr, toLinkPreview } from "./preview.ts";
import type { ExtractResult } from "./types.ts";

test("format helpers", () => {
  assert.equal(formatBytes(500), "1 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
  assert.equal(formatDuration(65), "1:05");
  assert.equal(platformLabelAr("tiktok"), "تيك توك");
});

test("toLinkPreview shapes thumbnail duration size", () => {
  const result: ExtractResult = {
    platform: "youtube",
    sourceUrl: "https://youtube.com/watch?v=dQw4w9wgXcQ",
    title: "Demo",
    author: "Rick",
    items: [
      {
        kind: "video",
        url: "https://example.com/v.mp4",
        thumbnail: "https://example.com/t.jpg",
        duration: 212,
        height: 720,
        variants: [
          { url: "https://example.com/v.mp4", quality: "720p", width: 1280, height: 720, size: 12_000_000, contentType: "video/mp4" },
        ],
      },
    ],
  };
  const p = toLinkPreview(result);
  assert.equal(p.platform, "youtube");
  assert.equal(p.thumbnail, "https://example.com/t.jpg");
  assert.equal(p.durationLabel, "3:32");
  assert.ok(p.sizeEstimateLabel);
  assert.ok(p.botDeepLink.includes("t.me/barq_ibot"));
  assert.equal(p.qualities[0]?.quality, "720p");
});
