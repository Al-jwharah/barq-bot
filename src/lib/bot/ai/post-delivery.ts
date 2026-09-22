/**
 * Post-download AI action row shown after successful delivery.
 */
import {
  SUMMARIZE_BTN,
  SUMMARIZE_CALLBACK,
} from "./summarize";
import { SMART_CLIPS_BTN, SMART_CLIPS_CALLBACK, smartClipsEligible } from "./smart-clips";
import { SUBTITLES_BTN, SUBTITLES_CALLBACK, subtitlesFeatureEnabled } from "./subtitles";
import { CAPTION_TONES, CAPTION_TONE_LABEL, captionCallback } from "./captions";
import type { LastClip } from "../session.server";

export type InlineBtn = { text: string; callback_data?: string; url?: string };

export function postDeliveryAiRows(clip?: LastClip, shareUrl?: string): InlineBtn[][] {
  const rows: InlineBtn[][] = [
    [
      { text: SUMMARIZE_BTN, callback_data: SUMMARIZE_CALLBACK },
      { text: "كابشن", callback_data: "ai:cap:menu" },
    ],
  ];
  const row2: InlineBtn[] = [];
  if (smartClipsEligible(clip)) {
    row2.push({ text: SMART_CLIPS_BTN, callback_data: SMART_CLIPS_CALLBACK });
  }
  if (subtitlesFeatureEnabled()) {
    row2.push({ text: SUBTITLES_BTN, callback_data: SUBTITLES_CALLBACK });
  }
  if (row2.length) rows.push(row2);
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
  return hasAi ? "تم التحميل ⚡️\nجرّب Barq AI على المقطع:" : "تم التحميل ⚡️";
}
