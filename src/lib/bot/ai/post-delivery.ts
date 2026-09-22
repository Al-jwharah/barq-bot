/**
 * Post-download «برق AI» actions after successful delivery.
 */
import {
  SUMMARIZE_BTN,
  SUMMARIZE_CALLBACK,
} from "./summarize";
import { SMART_CLIPS_BTN, SMART_CLIPS_CALLBACK, smartClipsEligible } from "./smart-clips";
import { SUBTITLES_BTN, SUBTITLES_CALLBACK, subtitlesFeatureEnabled } from "./subtitles";
import { CAPTION_TONES, CAPTION_TONE_LABEL, captionCallback } from "./captions";
import { BARQ_AI_BRAND } from "./copy";
import type { LastClip } from "../session.server";

export type InlineBtn = { text: string; callback_data?: string; url?: string };

/**
 * opts.shortLinks — show «رابط مؤقت» only when Blob/upload path is advertised.
 * opts.aiReady — when false, hide AI buttons (missing key / disabled).
 */
export function postDeliveryAiRows(
  clip?: LastClip,
  shareUrl?: string,
  opts?: { shortLinks?: boolean; aiReady?: boolean },
): InlineBtn[][] {
  const shortLinks = opts?.shortLinks === true;
  const aiReady = opts?.aiReady !== false;
  const rows: InlineBtn[][] = [];
  if (aiReady) {
    rows.push([
      { text: SUMMARIZE_BTN, callback_data: SUMMARIZE_CALLBACK },
      { text: "كابشن", callback_data: "ai:cap:menu" },
    ]);
    const row2: InlineBtn[] = [];
    if (smartClipsEligible(clip)) {
      row2.push({ text: SMART_CLIPS_BTN, callback_data: SMART_CLIPS_CALLBACK });
    }
    if (subtitlesFeatureEnabled()) {
      row2.push({ text: SUBTITLES_BTN, callback_data: SUBTITLES_CALLBACK });
    }
    if (row2.length) rows.push(row2);
  }
  if (shortLinks) {
    rows.push([{ text: "رابط مؤقت", callback_data: "go:short" }]);
  }
  if (shareUrl) {
    rows.push([{ text: "مشاركة", url: shareUrl }]);
  }
  return rows;
}

export function captionMenuRows(): InlineBtn[][] {
  return [
    CAPTION_TONES.map((tone) => ({
      text: CAPTION_TONE_LABEL[tone],
      callback_data: captionCallback(tone),
    })),
  ];
}

export function postDeliveryCaption(hasAi: boolean): string {
  if (!hasAi) return "تم التحميل ⚡️";
  return (
    `تم التحميل ⚡️\n` +
    `جرّب «${BARQ_AI_BRAND}» على المقطع:\n` +
    `لخّصه · كابشن · ترجمة`
  );
}
