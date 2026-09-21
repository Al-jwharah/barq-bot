import assert from "node:assert/strict";
import { test } from "node:test";
import { isHostedMediaCdn } from "./http.ts";
import { detectPlatform, supportedDownloadPlatform, tweetIdFromUrl, youtubeIdFromUrl, youtubePlaylistIdFromUrl } from "./urls.ts";

test("supports any video link including facebook reddit and generic", () => {
  assert.equal(supportedDownloadPlatform("https://vt.tiktok.com/ZSq7xKK2u"), "tiktok");
  assert.equal(supportedDownloadPlatform("https://www.instagram.com/reel/abc"), "instagram");
  assert.equal(supportedDownloadPlatform("https://x.com/user/status/1"), "x");
  assert.equal(supportedDownloadPlatform("https://youtu.be/dQw4w9WgXcQ"), "youtube");
  assert.equal(youtubeIdFromUrl("https://youtu.be/AyljUAFecBI?si=abc"), "AyljUAFecBI");
  assert.equal(youtubeIdFromUrl("https://www.youtube.com/watch?v=AyljUAFecBI"), "AyljUAFecBI");
  assert.equal(supportedDownloadPlatform("https://www.facebook.com/watch?v=1"), "facebook");
  assert.equal(supportedDownloadPlatform("https://reddit.com/r/x"), "reddit");
  assert.equal(supportedDownloadPlatform("https://example.com/watch/1"), "generic");
  assert.equal(detectPlatform("https://www.facebook.com/x"), "facebook");
  assert.equal(detectPlatform("https://www.pinterest.com/pin/123"), "pinterest");
  assert.equal(detectPlatform("https://pin.it/abc"), "pinterest");
  assert.equal(detectPlatform("https://clips.twitch.tv/ClipName"), "twitch");
  assert.equal(detectPlatform("https://www.twitch.tv/user/clip/abc"), "twitch");
  assert.equal(detectPlatform("https://ads.tiktok.com/business/creative/1"), "tiktok");
  assert.equal(youtubePlaylistIdFromUrl("https://www.youtube.com/playlist?list=PLabcdefghijklmnopqrstuv"), "PLabcdefghijklmnopqrstuv");
  assert.equal(youtubePlaylistIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghijklmnopqrstuv"), "PLabcdefghijklmnopqrstuv");
});

test("tweetIdFromUrl reads every X post shape", () => {
  assert.equal(tweetIdFromUrl("https://x.com/user/status/1724884212803834154"), "1724884212803834154");
  assert.equal(tweetIdFromUrl("https://twitter.com/i/web/status/1724884212803834154"), "1724884212803834154");
  assert.equal(tweetIdFromUrl("https://x.com/i/status/1724884212803834154?s=20"), "1724884212803834154");
  assert.equal(tweetIdFromUrl("https://mobile.twitter.com/a/status/1724884212803834154/video/1"), "1724884212803834154");
  assert.equal(tweetIdFromUrl("https://x.com/i/videos/tweet/1724884212803834154"), "1724884212803834154");
});

test("hosted media CDN allowlist for oversize proxy", () => {
  assert.equal(isHostedMediaCdn("https://video.twimg.com/amplify_video/1/vid/avc1/480x270/x.mp4"), true);
  assert.equal(isHostedMediaCdn("https://pbs.twimg.com/media/abc.jpg"), true);
  assert.equal(isHostedMediaCdn("https://evil.example/video.twimg.com/x.mp4"), false);
  assert.equal(isHostedMediaCdn("http://127.0.0.1/x.mp4"), false);
});
