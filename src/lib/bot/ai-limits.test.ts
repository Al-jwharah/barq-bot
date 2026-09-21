import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_DAILY_LIMIT,
  AI_INPUT_MAX,
  AI_TIMEOUT_LIMIT_MS,
  AI_TOKEN_MAX,
  AI_USER_ERROR,
  aiEnabled,
  clipAiInput,
  hideProviderError,
  isAiFailureReply,
  parseGrokMediaHint,
  redactSecrets,
  wantsMediaSummary,
  wantsWebSearch,
} from "./grok.server.ts";
import { archiveCaption, archiveWhoLine } from "./vault.server.ts";
import { ERROR_MESSAGES, errorCodeFromMessage } from "./errors.ts";
import {
  fitTelegramCloud,
  isKnownOverTelegramCloud,
  maxFilesizeFlag,
  telegramCloudMaxBytes,
  telegramCloudMaxMb,
} from "../media/ytdlp.ts";

test("clipAiInput truncates a 5000-char string to 2000", () => {
  const long = "x".repeat(5000);
  const clipped = clipAiInput(long);
  assert.equal(clipped.length, 2000);
  assert.equal(clipped, long.slice(0, 2000));
});

test("AI limits are 2000 in / 700 tokens / 30s / 10 per day", () => {
  assert.equal(AI_INPUT_MAX, 2000);
  assert.equal(AI_TOKEN_MAX, 700);
  assert.equal(AI_TIMEOUT_LIMIT_MS, 30000);
  assert.equal(AI_DAILY_LIMIT, 10);
  assert.equal(typeof aiEnabled(), "boolean");
});

test("clipAiInput redacts secrets before truncating", () => {
  const secret = ["xai", "abcdefghijklmnopqrstuvwxyz012345"].join("-");
  const out = clipAiInput(`hello ${secret} ${"y".repeat(2500)}`);
  assert.equal(out.includes("xai-"), false);
  assert.match(out, /\[redacted\]/);
  assert.ok(out.length <= 2000);
});

test("hideProviderError never leaks xAI or keys", () => {
  const msg = hideProviderError(new Error("xAI 401: invalid api key"));
  assert.equal(msg, AI_USER_ERROR);
  assert.equal(msg.includes("xAI"), false);
  assert.equal(msg.includes("401"), false);
});

test("summary and search intent helpers", () => {
  assert.equal(wantsMediaSummary("لخص المقطع"), true);
  assert.equal(wantsMediaSummary("مرحبا"), false);
  assert.equal(wantsWebSearch("ابحث عن محاضرة"), true);
  assert.equal(wantsWebSearch("لخص المقطع"), false);
  assert.equal(isAiFailureReply(AI_USER_ERROR), true);
});

test("redactSecrets strips telegram tokens and postgres urls", () => {
  const token = ["1234567890", "AAabcdefghijklmnopqrstuvwxyz012345"].join(":");
  const db = ["postgres://", "user", ":", "secretpass", "@", "host/db"].join("");
  const out = redactSecrets(`tok ${token} db ${db}`);
  assert.equal(out.includes("AAabcdefghijklmnopqrstuvwxyz012345"), false);
  assert.equal(out.includes("secretpass"), false);
  assert.match(out, /\[redacted\]/);
});

test("parseGrokMediaHint only accepts https media URLs", () => {
  assert.equal(parseGrokMediaHint("nope"), null);
  assert.deepEqual(parseGrokMediaHint('{"media_url":"https://cdn.example.com/a.mp4","kind":"video"}'), {
    url: "https://cdn.example.com/a.mp4",
    kind: "video",
  });
  assert.equal(parseGrokMediaHint('{"media_url":"http://cdn.example.com/a.mp4","kind":"video"}'), null);
  assert.equal(parseGrokMediaHint('{"media_url":"","kind":"video"}'), null);
});

test("vault captions use telegram id only and omit name/username", () => {
  const withNames = archiveWhoLine({ id: 8471762251, name: "Ali", username: "ali" });
  const without = archiveWhoLine({ id: 8471762251 });
  assert.equal(withNames, "طلب: 8471762251");
  assert.equal(without, "طلب: 8471762251");
  assert.equal(withNames.includes("Ali"), false);
  assert.equal(withNames.includes("ali"), false);
  const caption = archiveCaption({
    who: { id: 99, name: "Secret", username: "hidden" },
    sourceUrl: "https://example.com/v",
  });
  assert.match(caption, /طلب: 99/);
  assert.equal(caption.includes("Secret"), false);
  assert.equal(caption.includes("hidden"), false);
  assert.equal(archiveWhoLine(undefined), "طلب: مجهول");
});

test("known filesize over TELEGRAM_CLOUD_MAX_MB is FILE_TOO_LARGE", () => {
  assert.equal(telegramCloudMaxMb(), 50);
  assert.equal(maxFilesizeFlag(), "50M");
  const max = telegramCloudMaxBytes();
  assert.equal(isKnownOverTelegramCloud(undefined), false);
  assert.equal(isKnownOverTelegramCloud(0), false);
  assert.equal(isKnownOverTelegramCloud(max), false);
  assert.equal(isKnownOverTelegramCloud(max + 1), true);
  assert.equal(errorCodeFromMessage(ERROR_MESSAGES.FILE_TOO_LARGE), "FILE_TOO_LARGE");
  assert.equal(errorCodeFromMessage("file too large 50mb"), "FILE_TOO_LARGE");
});

test("fitTelegramCloud drops oversized variants and throws when all known sizes exceed cap", () => {
  const max = telegramCloudMaxBytes();
  const fitted = fitTelegramCloud({
    platform: "youtube",
    sourceUrl: "https://youtu.be/x",
    items: [
      {
        kind: "video",
        url: "https://example.com/big.mp4",
        variants: [
          { url: "https://example.com/big.mp4", quality: "1080", size: max + 10, contentType: "video/mp4" },
          { url: "https://example.com/ok.mp4", quality: "360", size: max - 10, contentType: "video/mp4" },
        ],
      },
    ],
  });
  assert.equal(fitted.items[0]?.url, "https://example.com/ok.mp4");
  assert.equal(fitted.items[0]?.variants.length, 1);

  assert.throws(
    () =>
      fitTelegramCloud({
        platform: "youtube",
        sourceUrl: "https://youtu.be/x",
        items: [
          {
            kind: "video",
            url: "https://example.com/big.mp4",
            variants: [
              { url: "https://example.com/big.mp4", quality: "1080", size: max + 10, contentType: "video/mp4" },
            ],
          },
        ],
      }),
    (err: unknown) => errorCodeFromMessage(err instanceof Error ? err.message : "") === "FILE_TOO_LARGE",
  );
});
