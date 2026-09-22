import assert from "node:assert/strict";
import { test } from "node:test";
import {
  domainVerdict,
  isBanKind,
  matchCsamKeywords,
  matchMusicDomain,
  matchMusicKeywords,
  matchPornDomain,
  matchPornKeywords,
  matchWomenKeywords,
  metadataVerdict,
  parseGrokVerdict,
  userBlockMessage,
} from "./safety.ts";

test("adult porn domains and keywords no longer block", () => {
  assert.equal(matchPornDomain("https://www.pornhub.com/view_video.php?viewkey=1"), null);
  assert.equal(matchPornDomain("https://m.xvideos.com/video123"), null);
  assert.equal(matchPornKeywords("Brazzers official scene"), null);
  assert.equal(matchPornKeywords("فيلم سكس كامل"), null);
  assert.equal(matchPornKeywords("nsfw 18+ onlyfans"), null);
  assert.equal(domainVerdict("https://www.pornhub.com/video"), null);
  assert.equal(
    metadataVerdict({ url: "https://example.com/a", title: "nsfw 18+ onlyfans" }),
    null,
  );
});

test("music and women soft blocks are off", () => {
  assert.equal(matchMusicDomain("https://soundcloud.com/artist/track"), null);
  assert.equal(matchMusicKeywords("أغنية جديدة 2026"), null);
  assert.equal(matchWomenKeywords("رقص بنات تيك توك"), null);
  assert.equal(userBlockMessage("music"), "");
  assert.equal(userBlockMessage("nsfw"), "");
  const song = parseGrokVerdict(
    '{"block":true,"kind":"music","confidence":0.95,"evidence_ar":"أغنية"}',
  );
  assert.equal(song?.block, false);
  const nsfw = parseGrokVerdict(
    '{"block":true,"kind":"nsfw","confidence":0.95,"evidence_ar":"محتوى +18"}',
  );
  assert.equal(nsfw?.block, false);
  assert.equal(isBanKind("nsfw"), false);
  assert.equal(isBanKind("porn_film"), false);
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

test("ordinary comedy / social hosts stay clear", () => {
  assert.equal(matchPornDomain("https://www.youtube.com/watch?v=abc"), null);
  assert.equal(matchPornDomain("https://tiktok.com/@x/video/1"), null);
  const allow = parseGrokVerdict(
    '{"block":false,"kind":"comedy","confidence":0.9,"evidence_ar":"سكرت كوميدي"}',
  );
  assert.equal(allow?.block, false);
});
