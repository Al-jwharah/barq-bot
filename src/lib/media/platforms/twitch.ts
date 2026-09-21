import { extractGeneric } from "./generic";
import type { ExtractResult } from "../types";

export async function extractTwitch(url: string): Promise<ExtractResult> {
  const result = await extractGeneric(url);
  return { ...result, platform: "twitch" };
}
