/**
 * Post-download «برق AI» action row — product-grade after successful delivery.
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

export const ANALYZE_BTN = "حلّل";
export const ANALYZE_CALLBACK = "ai:analyze";
export const STUDIO_BTN = "للنشر";
export const STUDIO_CALLBACK = "ai:studio";

export function postDeliveryAiRows(clip?: LastClip, shareUrl?: string): InlineBtn[][] {
  const rows: InlineBtn[][] = [
    [
      { text: SUMMARIZE_BTN, callback_data: SUMMARIZE_CALLBACK },
      { text: "كابشن", callback_data: "ai:cap:menu" },
      { text: ANALYZE_BTN, callback_data: ANALYZE_CALLBACK },
    ],
  ];
  const row2: InlineBtn[] = [{ text: STUDIO_BTN, callback_data: STUDIO_CALLBACK }];
  if (subtitlesFeatureEnabled()) {
    row2.push({ text: SUBTITLES_BTN, callback_data: SUBTITLES_CALLBACK });
  }
  if (smartClipsEligible(clip)) {
    row2.push({ text: SMART_CLIPS_BTN, callback_data: SMART_CLIPS_CALLBACK });
  }
  rows.push(row2);
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
    `لخّصه · كابشن · ترجمة · حلّل · للنشر`
  );
}
