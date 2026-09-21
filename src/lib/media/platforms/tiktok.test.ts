import assert from "node:assert/strict";
import { test } from "node:test";
import { isTikTokMusicCdn, isTikTokPhotoUrl, tiktokVideoId } from "./tiktok.ts";

test("tiktokVideoId reads numeric ids and ignores short codes", () => {
  assert.equal(
    tiktokVideoId("https://www.tiktok.com/@wahid_1877/video/7687615730665164040"),
    "7687615730665164040",
  );
  assert.equal(tiktokVideoId("https://vt.tiktok.com/ZSq3FSvcg"), null);
  assert.equal(
    tiktokVideoId("https://www.tiktok.com/@118_jooj/photo/7687587738283003143"),
    "7687587738283003143",
  );
});

test("photo posts and music CDN are not treated as video", () => {
  assert.equal(isTikTokPhotoUrl("https://www.tiktok.com/@118_jooj/photo/7687587738283003143"), true);
  assert.equal(isTikTokPhotoUrl("https://www.tiktok.com/@a/video/1"), false);
  assert.equal(
    isTikTokMusicCdn("https://v16-ies-music.tiktokcdn-us.com/abc/video/tos"),
    true,
  );
  assert.equal(isTikTokMusicCdn("https://v16-webapp-prime.tiktok.com/video/tos/x.mp4"), false);
});
