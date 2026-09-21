#!/usr/bin/env node
/**
 * Nitro bundles @electric-sql/pglite JS into `_libs/` but leaves behind the
 * sibling WASM/data files it loads via `new URL("./pglite.data", import.meta.url)`.
 * On Vercel that becomes ENOENT `/var/task/_libs/pglite.data`. Copy them next
 * to the bundled module after `vite build`.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules/@electric-sql/pglite/dist");
const files = ["pglite.data", "pglite.wasm", "initdb.wasm"];
const destDirs = [
  join(root, ".vercel/output/functions/__server.func/_libs"),
  join(root, ".vercel/output/functions/__server.func"),
  join(root, ".output/server/_libs"),
  join(root, ".output/server"),
];

let copied = 0;
for (const destDir of destDirs) {
  if (!existsSync(dirname(destDir))) continue;
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  for (const name of files) {
    const src = join(srcDir, name);
    if (!existsSync(src)) continue;
    copyFileSync(src, join(destDir, name));
    copied += 1;
    console.log(`[pglite-assets] ${name} -> ${destDir}`);
  }
}

if (!copied) {
  console.log("[pglite-assets] no Nitro output dirs yet — skipped");
  process.exit(0);
}
console.log(`[pglite-assets] copied ${copied} file(s)`);
