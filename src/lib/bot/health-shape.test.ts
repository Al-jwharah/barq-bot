import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("public health JSON never interpolates secret env values", () => {
  const src = readFileSync("src/routes/api/health.ts", "utf8");
  assert.match(src, /postgres: dbSource === "neon"/);
  assert.match(src, /degraded/);
  assert.match(src, /publicBody/);
  assert.equal(/process\.env\.TELEGRAM_BOT_TOKEN/.test(src), false);
  assert.equal(/process\.env\.DATABASE_URL/.test(src), false);
  assert.equal(/process\.env\.XAI_API_KEY/.test(src), false);
  assert.equal(/process\.env\.BARQ_ADMIN_PIN/.test(src), false);
});
