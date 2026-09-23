import { MediaBlockedError, matchPornDomain } from "./safety";
import type { ExtractResult } from "../media/types";

export async function assertAdultVisual(url: string, result?: ExtractResult): Promise<void> {
  const domain =
    matchPornDomain(url) || result?.items.map((item) => (item.url ? matchPornDomain(item.url) : null)).find(Boolean);
  if (domain) {
    throw new MediaBlockedError("أُزيل المقطع. المحتوى الإباحي ممنوع.", domain.domain, "nsfw");
  }
}
