import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheKeyFor } from "./file-cache.server.ts";

test("telegram file cache key is stable", () => {
  assert.equal(cacheKeyFor("https://a.example/x"), cacheKeyFor("https://a.example/x"));
  assert.notEqual(cacheKeyFor("https://a.example/x"), cacheKeyFor("https://a.example/y"));
  assert.equal(cacheKeyFor("https://a.example/x").length, 32);
});
