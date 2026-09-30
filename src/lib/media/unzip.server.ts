/**
 * Minimal ZIP extractor (stored + deflate) for pinned tool archives.
 * Rejects absolute paths / ".." entries (zip-slip) and symlinks.
 */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { inflateRawSync } from "node:zlib";

export async function extractZip(buf: Buffer, dest: string): Promise<number> {
  const root = resolve(dest);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: no end record");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  let written = 0;
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip: bad central header");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const extAttr = buf.readUInt32LE(p + 38);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;

    const mode = (extAttr >>> 16) & 0o177777;
    const isLink = (mode & 0o170000) === 0o120000;
    if (isLink) throw new Error("zip: symlink entries not allowed");
    if (name.startsWith("/") || name.split(/[\\/]/).includes("..")) throw new Error("zip: unsafe path");
    const out = resolve(root, name);
    if (out !== root && !out.startsWith(root + sep)) throw new Error("zip: unsafe path");
    if (name.endsWith("/")) {
      await mkdir(out, { recursive: true });
      continue;
    }
    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error("zip: bad local header");
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
    if (!data) throw new Error(`zip: unsupported method ${method}`);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, data);
    if (mode & 0o111) await chmod(out, 0o755);
    written += 1;
  }
  return written;
}

