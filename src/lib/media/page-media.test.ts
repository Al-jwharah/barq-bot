import assert from "node:assert/strict";
import { test } from "node:test";
import { iframeFromOembed, oembedLinks, pageMediaCandidates, pageTitle, pageUrlPool } from "./page-media";

const base = "https://news.example.org/story/1";

test("og:video and <video> are direct candidates, images dropped", () => {
  const html = `<meta property="og:video" content="https://cdn.example.net/a.mp4?x=1&amp;y=2">
  <meta property="og:image" content="https://cdn.example.net/a.jpg">
  <video src="/media/b.webm"></video>`;
  const c = pageMediaCandidates(html, base);
  assert.deepEqual(c.map((x) => x.url), ["https://cdn.example.net/a.mp4?x=1&y=2", "https://news.example.org/media/b.webm"]);
  assert.ok(c.every((x) => x.type === "direct"));
});

test("manifests, JSON-LD and escaped script URLs are found", () => {
  const html = `<script type="application/ld+json">{"@type":"VideoObject","contentUrl":"https://v.example.com/x/master.m3u8","embedUrl":"https://player.example.com/embed/9"}</script>
  <script>var cfg={"file":"https:\\/\\/media.example.com\\/clip.mp4"}</script>`;
  const c = pageMediaCandidates(html, base);
  const urls = c.map((x) => x.url);
  assert.ok(urls.includes("https://v.example.com/x/master.m3u8"));
  assert.ok(urls.includes("https://media.example.com/clip.mp4"));
  assert.ok(urls.includes("https://player.example.com/embed/9"));
  assert.equal(c.find((x) => x.url.endsWith(".m3u8"))?.type, "manifest");
  assert.equal(c[c.length - 1]?.type, "embed");
});

test("iframes only when they look like players", () => {
  const html = `<iframe src="https://ads.example.com/banner"></iframe><iframe src="//www.youtube.com/embed/abc"></iframe>`;
  const c = pageMediaCandidates(html, base);
  assert.deepEqual(c.map((x) => x.url), ["https://www.youtube.com/embed/abc"]);
});

test("oEmbed discovery and iframe extraction", () => {
  const html = `<link rel="alternate" type="application/json+oembed" href="https://site.example/oembed?url=x&amp;f=json">`;
  assert.deepEqual(oembedLinks(html, base), ["https://site.example/oembed?url=x&f=json"]);
  assert.equal(
    iframeFromOembed({ html: '<iframe src="https://player.site.example/video/7?h=1"></iframe>' }, base),
    "https://player.site.example/video/7?h=1",
  );
  assert.equal(iframeFromOembed({ html: "<blockquote>no</blockquote>" }, base), null);
});

test("url pool skips assets and non-http schemes", () => {
  const html = `<a href="/watch/5">x</a><script src="/app.js"></script><img src="/a.png"><a href="javascript:void(0)">y</a>`;
  assert.deepEqual(pageUrlPool(html, base), ["https://news.example.org/watch/5"]);
});

test("page title prefers og:title", () => {
  assert.equal(pageTitle(`<title>T</title><meta property="og:title" content="OG &amp; co">`), "OG & co");
  assert.equal(pageTitle(`<title> Plain </title>`), "Plain");
});
