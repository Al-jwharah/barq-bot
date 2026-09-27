import { createDecipheriv, createHash } from "node:crypto";

type Rights = { key: string; iv: string; glt: string };

function unwrap(wrappedB64: string, clipId: string, userKey: Buffer): Buffer {
  const wrapped = Buffer.from(wrappedB64, "base64");
  const nonce = wrapped.subarray(0, 12);
  const tag = wrapped.subarray(wrapped.length - 16);
  const cipher = wrapped.subarray(12, wrapped.length - 16);
  const dec = createDecipheriv("aes-256-gcm", userKey, nonce);
  dec.setAuthTag(tag);
  dec.setAAD(Buffer.from(clipId));
  return Buffer.concat([dec.update(cipher), dec.final()]);
}

export function isClearMedia(bytes: Buffer): boolean {
  return bytes.subarray(4, 8).toString() === "ftyp" || bytes.subarray(0, 3).toString() === "ID3";
}

export async function decryptSunoMedia(encrypted: Buffer, clipId: string): Promise<Buffer> {
  const res = await fetch("https://studio-api-prod.suno.com/api/mango/rights", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://suno.com",
      Referer: "https://suno.com/",
    },
    body: JSON.stringify({ content_params: { content_id: clipId, content_type: "clip" } }),
  });
  if (!res.ok) throw new Error("تعذر فك ملف الأغنية من Suno.");
  const rights = (await res.json()) as Rights;
  if (!rights.key || !rights.iv || !rights.glt) throw new Error("تعذر فك ملف الأغنية من Suno.");
  const userKey = createHash("sha256").update(rights.glt).digest();
  const key = unwrap(rights.key, clipId, userKey);
  const counter = unwrap(rights.iv, clipId, userKey);
  const algo = key.length === 32 ? "aes-256-ctr" : "aes-128-ctr";
  const iv = counter.length >= 16 ? counter.subarray(0, 16) : Buffer.concat([counter, Buffer.alloc(16)]).subarray(0, 16);
  const dec = createDecipheriv(algo, key, iv);
  const clear = Buffer.concat([dec.update(encrypted), dec.final()]);
  if (!isClearMedia(clear)) throw new Error("ملف Suno ما انفك بشكل صحيح.");
  return clear;
}
