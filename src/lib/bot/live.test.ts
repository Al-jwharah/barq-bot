import assert from "node:assert/strict";
import { test } from "node:test";
import { liveHelp, parseLiveTarget } from "./live.server.ts";

test("parseLiveTarget accepts handle and urls", () => {
  assert.deepEqual(parseLiveTarget("/live @shroud"), { handle: "shroud", url: "https://www.twitch.tv/shroud" });
  const yt = parseLiveTarget("/live https://www.youtube.com/watch?v=abc");
  assert.equal(yt?.handle, "watch");
  assert.equal(parseLiveTarget("/live"), null);
  assert.equal(parseLiveTarget("/live hi there"), null);
  assert.match(liveHelp(), /بث/);
});
