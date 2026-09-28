import assert from "node:assert/strict";
import { test } from "node:test";
import { videoUrlsFromHtml } from "./generic.ts";

test("generic html keeps a real video and drops the page image", () => {
  const html = `
    <meta property="og:image" content="https://cdn.example/cover.jpg" />
    <meta property="og:video" content="https://cdn.example/clip.mp4" />
    <video src="https://cdn.example/alt.webm"></video>
    <meta property="og:image" content="https://cdn.example/banner.png" />
  `;
  const urls = videoUrlsFromHtml(html);
  assert.deepEqual(urls, ["https://cdn.example/clip.mp4", "https://cdn.example/alt.webm"]);
});

test("a page that only has a preview image is not a video", () => {
  const html = `<meta property="og:image" content="https://cdn.example/meta-preview.jpg" />`;
  assert.deepEqual(videoUrlsFromHtml(html), []);
});
