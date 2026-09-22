import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUMMARIZE_BTN,
  SUMMARIZE_CALLBACK,
  SUMMARIZE_ENV_PROPOSAL,
  buildSummaryUserPayload,
  clampSummaryAr,
  summarizeEnvProposalLines,
  transcribeEnabled,
} from "./summarize.ts";

test("لخّصه button constants", () => {
  assert.equal(SUMMARIZE_BTN, "لخّصه");
  assert.equal(SUMMARIZE_CALLBACK, "ai:sum");
});

test("buildSummaryUserPayload includes title/url and optional transcript", () => {
  const payload = buildSummaryUserPayload(
    { url: "https://x.com/a/status/1", title: "تجربة", platform: "x", duration: 42 },
    "مرحبا بالعالم",
  );
  assert.match(payload, /تجربة/);
  assert.match(payload, /https:\/\/x\.com/);
  assert.match(payload, /مرحبا بالعالم/);
  assert.match(payload, /42/);
});

test("clampSummaryAr keeps at most 3 sentences", () => {
  const long = "أ. ب. ج. د. هـ.";
  const out = clampSummaryAr(long);
  assert.ok(out.split(/(?<=[.!?؟。])\s+/).filter(Boolean).length <= 3);
});

test("ENV proposal names only — transcribe defaults off", () => {
  delete process.env.BARQ_AI_TRANSCRIBE;
  assert.equal(transcribeEnabled(), false);
  assert.equal(SUMMARIZE_ENV_PROPOSAL.whisperUrl, "BARQ_WHISPER_URL");
  const lines = summarizeEnvProposalLines().join("\n");
  assert.match(lines, /BARQ_AI_TRANSCRIBE/);
  assert.match(lines, /BARQ_WHISPER/);
});
