import assert from "node:assert/strict";
import { test } from "node:test";
import { syndicationToken, unwrapGqlTweet } from "./x.ts";

test("syndication token matches react-tweet / yt-dlp formula", () => {
  const t = syndicationToken("1724884212803834154");
  assert.match(t, /^[0-9a-z]+$/);
  assert.equal(t.includes("."), false);
  assert.equal(t.includes("0"), false);
});

test("unwraps nested sensitive GraphQL tweets", () => {
  const inner = {
    __typename: "Tweet",
    legacy: {
      full_text: "ok",
      extended_entities: { media: [{ type: "video", video_info: { variants: [{ url: "https://video.twimg.com/a.mp4", content_type: "video/mp4" }] } }] },
    },
  };
  const outer = { __typename: "TweetWithVisibilityResults", tweet: inner };
  const got = unwrapGqlTweet(outer);
  assert.equal(got?.legacy?.extended_entities?.media?.length, 1);
  assert.equal(unwrapGqlTweet({ __typename: "TweetUnavailable" }), null);
});
