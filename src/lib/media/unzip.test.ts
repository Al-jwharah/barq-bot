import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { extractZip } from "./unzip.server";

/** Build a stored (uncompressed) zip. mode = unix mode bits. */
function makeZip(entries: Array<{ name: string; data: string; mode?: number }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const data = Buffer.from(e.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((e.mode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test("extracts files and keeps the exec bit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "barq-unzip-"));
  try {
    const n = await extractZip(makeZip([{ name: "bin/tool", data: "#!x", mode: 0o100755 }, { name: "a.txt", data: "hi" }]), dir);
    assert.equal(n, 2);
    assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "hi");
    assert.ok(statSync(join(dir, "bin/tool")).mode & 0o100);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects zip-slip and symlinks", async () => {
  const dir = mkdtempSync(join(tmpdir(), "barq-unzip-"));
  try {
    await assert.rejects(extractZip(makeZip([{ name: "../evil", data: "x" }]), dir), /unsafe path/);
    await assert.rejects(extractZip(makeZip([{ name: "/abs", data: "x" }]), dir), /unsafe path/);
    await assert.rejects(extractZip(makeZip([{ name: "link", data: "/etc/passwd", mode: 0o120777 }]), dir), /symlink/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
