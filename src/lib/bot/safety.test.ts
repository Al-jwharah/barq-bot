import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchMusicDomain,
  matchMusicKeywords,
  matchPornDomain,
  matchPornKeywords,
  matchWomenKeywords,
  parseGrokVerdict,
  userBlockMessage,
} from "./safety.ts";

test("blocks dedicated porn-tube hosts", () => {
  assert.equal(matchPornDomain("https://www.pornhub.com/view_video.php?viewkey=1")?.domain, "pornhub.com");
  assert.equal(matchPornDomain("https://m.xvideos.com/video123")?.domain, "xvideos.com");
  assert.equal(matchPornDomain("https://rt.pornhub.com/video")?.domain, "pornhub.com");
  assert.ok(matchPornDomain("https://clip.example.xxx/a"));
});

test("does not treat social and comedy hosts as porn domains", () => {
  assert.equal(matchPornDomain("https://www.youtube.com/watch?v=abc"), null);
  assert.equal(matchPornDomain("https://tiktok.com/@x/video/1"), null);
  assert.equal(matchPornDomain("https://x.com/user/status/1"), null);
  assert.equal(matchPornDomain("https://www.reddit.com/r/funny/comments/1"), null);
  assert.equal(matchPornDomain("https://www.imdb.com/title/tt0111161"), null);
  assert.equal(matchPornDomain("https://essex.com/news"), null);
});

test("keyword matcher is about actual films, not jokes", () => {
  assert.ok(matchPornKeywords("Brazzers official scene"));
  assert.ok(matchPornKeywords("فيلم سكس كامل"));
  assert.ok(matchPornKeywords("Age-restricted adult content"));
  assert.ok(matchPornKeywords("nsfw 18+ onlyfans"));
  assert.equal(matchPornKeywords("this comedy sketch is so bad it's porn lol"), null);
  assert.equal(matchPornKeywords("sex education documentary trailer"), null);
});

test("grok verdict blocks nsfw at moderate confidence", () => {
  const allow = parseGrokVerdict(
    '{"block":false,"kind":"comedy","confidence":0.9,"evidence_ar":"سكرت كوميدي"}',
  );
  assert.equal(allow?.block, false);

  const weak = parseGrokVerdict(
    '{"block":true,"kind":"porn_film","confidence":0.4,"evidence_ar":"غير واضح"}',
  );
  assert.equal(weak?.block, false);

  const hard = parseGrokVerdict(
    '{"block":true,"kind":"porn_film","confidence":0.96,"evidence_ar":"فيلم استوديو إباحي"}',
  );
  assert.equal(hard?.block, true);
  assert.match(hard?.evidence ?? "", /إباحي/);

  const nsfw = parseGrokVerdict(
    '{"block":true,"kind":"nsfw","confidence":0.7,"evidence_ar":"محتوى +18"}',
  );
  assert.equal(nsfw?.block, true);
});

test("blocks music hosts and song keywords, not comedy jokes", () => {
  assert.equal(matchMusicDomain("https://soundcloud.com/artist/track")?.domain, "soundcloud.com");
  assert.ok(matchMusicKeywords("أغنية جديدة 2026"));
  assert.ok(matchWomenKeywords("رقص بنات تيك توك"));
  assert.equal(userBlockMessage("music"), "");
  assert.equal(userBlockMessage("nsfw"), "");
  const song = parseGrokVerdict(
    '{"block":true,"kind":"music","confidence":0.8,"evidence_ar":"أغنية"}',
  );
  assert.equal(song?.block, true);
});
