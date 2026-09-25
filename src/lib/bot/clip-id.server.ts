import { randomBytes } from "node:crypto";
import { CLIP_ID_BYTES } from "./clip-id";

export function generateClipId(): string {
  return randomBytes(CLIP_ID_BYTES).toString("base64url");
}
