import { createServerFn } from "@tanstack/react-start";
import { extractMedia } from "./extract";
import type { ExtractResult } from "./types";

export const resolveMedia = createServerFn({ method: "POST" })
  .validator((data: { url: string }) => {
    if (!data || typeof data.url !== "string" || data.url.trim().length < 8) {
      throw new Error("أدخل رابط صحيح");
    }
    return { url: data.url.trim() };
  })
  .handler(async ({ data }): Promise<ExtractResult> => {
    return extractMedia(data.url);
  });

export const getStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { botHealth } = await import("../bot/webhook.server");
  return botHealth();
});
