import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  assertPreExtractBlocklist,
  domainVerdict,
  isBanKind,
  matchCsamKeywords,
  matchMusicDomain,
  matchMusicKeywords,
  matchPornDomain,
  matchPornKeywords,
  matchWomenKeywords,
  MediaBlockedError,
  metadataVerdict,
  parseGrokVerdict,
  userBlockMessage,
} from "./safety.ts";

test("porn domains and NSFW keywords block", () => {
  assert.ok(matchPornDomain("https://www.pornhub.com/view_video.php?viewkey=1"));
  assert.ok(matchPornDomain("https://m.xvideos.com/video123"));
  assert.ok(matchPornDomain("https://cdn.phncdn.com/videos/a.mp4"));
  assert.ok(matchPornKeywords("Brazzers official scene"));
  assert.ok(matchPornKeywords("فيلم سكس كامل"));
  assert.ok(matchPornKeywords("onlyfans leaked video"));
  assert.ok(matchPornKeywords("full pornographic movie download"));
  // Owner lock: the keyword filter is not narrowed…
  assert.ok(matchPornKeywords("nsfw tip"));
  // …but religious warnings on mainstream hosts (TikTok/YouTube…) are not keyword-blocked.
  assert.equal(
    metadataVerdict({ url: "https://www.tiktok.com/@x/video/1", title: "موعظة عن خطر الإباحية" }),
    null,
  );
  const d = domainVerdict("https://www.pornhub.com/video");
  assert.equal(d?.block, true);
  assert.equal(d?.kind, "domain");
  const m = metadataVerdict({ url: "https://example.com/a", title: "onlyfans leaked video" });
  assert.equal(m?.block, true);
  assert.equal(m?.kind, "nsfw");
});

test("music and women matchers stay intact (owner lock) but are not ban kinds", () => {
  assert.ok(matchMusicDomain("https://soundcloud.com/artist/track"));
  assert.ok(matchMusicKeywords("أغنية جديدة 2026"));
  assert.ok(matchWomenKeywords("رقص بنات تيك توك"));
  // Pre-extract domain gate is porn-only, same as production.
  assert.equal(domainVerdict("https://soundcloud.com/artist/track"), null);
  assert.equal(userBlockMessage("music"), "");
  const song = parseGrokVerdict(
    '{"block":true,"kind":"music","confidence":0.95,"evidence_ar":"أغنية"}',
  );
  assert.equal(song?.block, true);
  assert.equal(isBanKind("music"), false);
  assert.equal(isBanKind("women"), false);
});

test("CSAM keywords and verdicts still block", () => {
  assert.ok(matchCsamKeywords("suspected csam material"));
  assert.ok(matchCsamKeywords("مواد استغلال أطفال"));
  const hit = metadataVerdict({ url: "https://example.com/x", title: "child porn archive" });
  assert.equal(hit?.block, true);
  assert.equal(hit?.kind, "csam");
  assert.equal(isBanKind("csam"), true);
  const grok = parseGrokVerdict(
    '{"block":true,"kind":"csam","confidence":0.9,"evidence_ar":"قاصر"}',
  );
  assert.equal(grok?.block, true);
  assert.equal(grok?.kind, "csam");
});

test("Grok NSFW / domain blocks; comedy stays clear", () => {
  const nsfw = parseGrokVerdict(
    '{"block":true,"kind":"nsfw","confidence":0.95,"evidence_ar":"محتوى +18"}',
  );
  assert.equal(nsfw?.block, true);
  assert.equal(isBanKind("nsfw"), true);
  assert.equal(isBanKind("porn_film"), true);
  assert.equal(isBanKind("domain"), true);
  assert.ok(userBlockMessage("nsfw").length > 0);
  assert.equal(matchPornDomain("https://www.youtube.com/watch?v=abc"), null);
  assert.equal(matchPornDomain("https://tiktok.com/@x/video/1"), null);
  const allow = parseGrokVerdict(
    '{"block":false,"kind":"comedy","confidence":0.9,"evidence_ar":"سكرت كوميدي"}',
  );
  assert.equal(allow?.block, false);
});

test("assertPreExtractBlocklist throws MediaBlockedError before extract", () => {
  assert.throws(
    () => assertPreExtractBlocklist("https://www.pornhub.com/view_video.php?viewkey=1"),
    (err: unknown) => err instanceof MediaBlockedError && err.kind === "domain",
  );
  assert.throws(
    () => assertPreExtractBlocklist("https://example.com/watch/childporn-archive"),
    (err: unknown) => err instanceof MediaBlockedError && err.kind === "csam",
  );
  assert.doesNotThrow(() => assertPreExtractBlocklist("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
  assert.doesNotThrow(() => assertPreExtractBlocklist("https://x.com/user/status/123"));
  assert.doesNotThrow(() => assertPreExtractBlocklist("https://vt.tiktok.com/ZSqoLyr2c"));
});

test("religious TikTok metadata on mainstream hosts is not blocked by porn keywords", () => {
  const titles = [
    "موعظة عن خطر الإباحية",
    "احذروا مواقع الإباحي",
    "نصيحة دينية",
    "سورة البقرة",
  ];
  for (const title of titles) {
    const v = metadataVerdict({ url: "https://vt.tiktok.com/ZSqoLyr2c", title });
    assert.equal(v, null, `should allow title: ${title}`);
  }
  // CSAM on mainstream still blocks
  const csam = metadataVerdict({
    url: "https://vt.tiktok.com/ZSqoLyr2c",
    title: "child porn archive",
  });
  assert.equal(csam?.block, true);
  assert.equal(csam?.kind, "csam");
  // Non-mainstream host with clear porn-film phrase still blocks
  const film = metadataVerdict({
    url: "https://random-blog.example/watch",
    title: "فيلم سكس كامل",
  });
  assert.equal(film?.block, true);
  assert.equal(film?.kind, "nsfw");
});

test("extractMedia source calls assertPreExtractBlocklist before unwrap/extract", () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const extractSrc = readFileSync(join(root, "../media/extract.ts"), "utf8");
  assert.match(extractSrc, /assertPreExtractBlocklist/);
  const fnIdx = extractSrc.indexOf("export async function extractMedia");
  assert.ok(fnIdx >= 0, "extractMedia export present");
  const body = extractSrc.slice(fnIdx);
  const gateIdx = body.indexOf("assertPreExtractBlocklist(raw)");
  const unwrapIdx = body.indexOf("await unwrap(raw)");
  const platformCall = body.indexOf("extractForPlatform(url");
  assert.ok(gateIdx >= 0, "gate called on raw url");
  assert.ok(gateIdx < unwrapIdx, "blocklist before unwrap");
  assert.ok(gateIdx < platformCall, "blocklist before platform extract call");
  const workerSrc = readFileSync(join(root, "../jobs/worker.server.ts"), "utf8");
  const safeIdx = workerSrc.indexOf("await assertSafeMedia(job.url)");
  const extractIdx = workerSrc.indexOf("await extractMedia(job.url)");
  assert.ok(safeIdx >= 0 && extractIdx > safeIdx, "worker assertSafeMedia before extractMedia");
  const handleSrc = readFileSync(join(root, "handle.server.ts"), "utf8");
  assert.match(handleSrc, /domainVerdict\(url\)/);
});

test("pre-extract gate does not block plain numbers in URLs (Suno ids, years)", () => {
  assert.doesNotThrow(() => assertPreExtractBlocklist("https://suno.com/song/1843a918-0018-4c18-9a18-18aa18bb18cc"));
  assert.doesNotThrow(() => assertPreExtractBlocklist("https://example.com/videos/2018/clip"));
  assert.throws(() => assertPreExtractBlocklist("https://www.pornhub.com/view_video.php?viewkey=1"), MediaBlockedError);
  assert.ok(matchPornKeywords("مقطع +18"));
});
