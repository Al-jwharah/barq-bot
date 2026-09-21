import assert from "node:assert/strict";
import { test } from "node:test";
import {
  choiceLabel,
  monthlyLine,
  parseQualityCallback,
  progressBar,
  variantForChoice,
} from "./library.server.ts";
import type { MediaItem } from "../media/types.ts";

test("progress bar fills by ratio", () => {
  assert.equal(progressBar(0, 30), "░░░░░░░░░░");
  assert.equal(progressBar(30, 30), "██████████");
  assert.equal(progressBar(15, 30).includes("█"), true);
  assert.match(monthlyLine(12, 30, false), /12\/30/);
  assert.match(monthlyLine(12, 30, true), /بلا حد/);
});

test("quality callback parser", () => {
  assert.deepEqual(parseQualityCallback("q:deadbeef12:720"), { id: "deadbeef12", choice: "720" });
  assert.deepEqual(parseQualityCallback("q:deadbeef12:snap"), { id: "deadbeef12", choice: "snap" });
  assert.deepEqual(parseQualityCallback("q:deadbeef12:360"), { id: "deadbeef12", choice: "360" });
  assert.equal(parseQualityCallback("q:nope:720"), null);
  assert.equal(parseQualityCallback("job:cancel:1"), null);
});

test("variantForChoice picks closest height", () => {
  const item: MediaItem = {
    kind: "video",
    url: "https://cdn.example/best.mp4",
    variants: [
      { url: "https://cdn.example/480.mp4", quality: "480p", height: 480, contentType: "video/mp4", size: 8e6 },
      { url: "https://cdn.example/720.mp4", quality: "720p", height: 720, contentType: "video/mp4", size: 18e6 },
      { url: "https://cdn.example/1080.mp4", quality: "1080p", height: 1080, contentType: "video/mp4", size: 40e6 },
    ],
  };
  assert.equal(variantForChoice(item, "720").height, 720);
  assert.equal(variantForChoice(item, "480").height, 480);
  assert.equal(choiceLabel("720", item.variants[1]), "720p");
  assert.equal(choiceLabel("mp3"), "MP3");
});
