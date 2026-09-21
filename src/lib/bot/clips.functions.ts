import { createServerFn } from "@tanstack/react-start";
import { getClipLink } from "./store.server";
import { clipDeniedReason, isClipId, toPublicClip } from "./clip-id";
import { publicUrl } from "./origin";

export const loadClip = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const id = typeof data === "string" ? data : (data as { id?: string })?.id;
    if (!id || !isClipId(id)) throw new Error("الرابط غير متاح");
    return { id };
  })
  .handler(async ({ data }) => {
    const clip = await getClipLink(data.id);
    if (!clip || clipDeniedReason(clip)) throw new Error("الرابط غير متاح");
    const pub = toPublicClip(clip);
    const left = clip.expires_at ? Math.max(0, Date.parse(clip.expires_at) - Date.now()) : 0;
    const hours = Math.max(1, Math.ceil(left / 3_600_000));
    return {
      id: pub.id,
      mediaUrl: publicUrl(`/d/${pub.id}`),
      thumbnail: pub.thumbnail,
      kind: pub.kind,
      platform: pub.platform,
      expiresAt: pub.expiresAt,
      hoursLeft: hours,
    };
  });
