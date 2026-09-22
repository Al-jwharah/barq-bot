import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_SKIP_LABELS,
  aiEntryCopy,
  decideAiRoute,
  isAiEntryOnly,
  shouldRouteFreeTextToAi,
} from "./route.ts";

test("UI labels are skipped (no AI burn)", () => {
  assert.equal(decideAiRoute("كيف يعمل").kind, "skip");
  assert.equal(decideAiRoute("نقاطي").kind, "skip");
  assert.equal(decideAiRoute("حدّي").kind, "skip");
  assert.equal(AI_SKIP_LABELS.has("كيف يعمل"), true);
});

test("/ai alone is entry; /ai with prompt is live chat", () => {
  assert.equal(decideAiRoute("/ai").kind, "entry");
  assert.equal(decideAiRoute("Barq AI").kind, "entry");
  assert.equal(isAiEntryOnly("جروك"), true);
  const chat = decideAiRoute("/ai لخص المقطع");
  assert.equal(chat.kind, "chat");
  if (chat.kind === "chat") assert.match(chat.prompt, /لخص/);
});

test("plain Arabic free text routes to live xAI chat", () => {
  assert.equal(shouldRouteFreeTextToAi("اشرح لي الفكرة"), true);
  assert.equal(shouldRouteFreeTextToAi("لخّص الفيديو الأخير"), true);
  assert.equal(shouldRouteFreeTextToAi("hello what is this clip"), true);
  assert.equal(shouldRouteFreeTextToAi("/help"), false);
  assert.equal(shouldRouteFreeTextToAi(""), false);
});

test("aiEntryCopy mentions live readiness and daily cap", () => {
  const copy = aiEntryCopy(10);
  assert.match(copy, /جاهز الآن/);
  assert.match(copy, /10/);
  assert.match(copy, /Barq AI/);
});
