import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { envFlag, FILE_RETENTION_DAYS, LOG_RETENTION_DAYS, TEMP_FILE_RETENTION_HOURS } from "./config.server";
import { logJson } from "./observability.server";

export type CleanupResult = {
  clips: number;
  jobs: number;
  logs: number;
  files: number;
  bytes: number;
};

const ZERO: CleanupResult = { clips: 0, jobs: 0, logs: 0, files: 0, bytes: 0 };

const TEMP_PREFIXES = ["barq-", "barqwm-", "barq-job-"];
const JOB_DIR_NAMES = ["jobs", "barq-jobs"];

/** Reads CLEANUP_ENABLED on every call (config const is frozen at import). */
export function shouldRunCleanup(): boolean {
  return envFlag("CLEANUP_ENABLED", true);
}

function positiveEnvInt(name: string, fallback: number): number {
  if (typeof process !== "undefined") {
    const n = Number(process.env[name]?.trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

export function fileRetentionDays(): number {
  return positiveEnvInt("FILE_RETENTION_DAYS", FILE_RETENTION_DAYS || 7);
}

export function tempRetentionHours(): number {
  return positiveEnvInt("TEMP_FILE_RETENTION_HOURS", TEMP_FILE_RETENTION_HOURS || 6);
}

export function logRetentionDays(): number {
  return positiveEnvInt("LOG_RETENTION_DAYS", LOG_RETENTION_DAYS || 30);
}

function blobKeys(rows: { storage_key?: string | null; media_url?: string | null }[]): string[] {
  return rows
    .flatMap((r) => [r.storage_key, r.media_url])
    .filter((v): v is string => Boolean(v && (v.startsWith("host/") || v.includes("blob.vercel-storage.com"))));
}

async function deleteClipBlobs(keys: string[]): Promise<number> {
  if (!keys.length) return 0;
  try {
    const helper = (await import("./clip-blob.server")) as {
      deleteClipBlobs?: (k: string[]) => Promise<void>;
      deleteClipBlob?: (k: string | string[]) => Promise<void>;
    };
    if (typeof helper.deleteClipBlobs === "function") {
      await helper.deleteClipBlobs(keys);
      return keys.length;
    }
    if (typeof helper.deleteClipBlob === "function") {
      await helper.deleteClipBlob(keys);
      return keys.length;
    }
  } catch {
    // helper not present
  }
  const token = typeof process !== "undefined" ? process.env.BLOB_READ_WRITE_TOKEN?.trim() : "";
  if (!token) return 0;
  const { del } = await import("@vercel/blob");
  await del(keys, { token });
  return keys.length;
}

async function sqlClient() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function expireClipLinks(): Promise<{ clips: number; files: number }> {
  const sql = await sqlClient();
  const days = fileRetentionDays();
  let stale: { storage_key: string | null; media_url: string | null }[] = [];
  try {
    stale = await sql<{ storage_key: string | null; media_url: string | null }>`
      select storage_key, media_url from clip_links
      where (expires_at is not null and expires_at < now())
         or revoked_at is not null
         or created_at < now() - (${days} * interval '1 day')
    `;
  } catch {
    try {
      stale = await sql<{ storage_key: string | null; media_url: string | null }>`
        select storage_key, media_url from clip_links
        where (expires_at is not null and expires_at < now())
           or created_at < now() - (${days} * interval '1 day')
      `;
    } catch {
      return { clips: 0, files: 0 };
    }
  }
  const files = await deleteClipBlobs(blobKeys(stale)).catch(() => 0);
  try {
    const deleted = await sql<{ id: string }>`
      delete from clip_links
      where (expires_at is not null and expires_at < now())
         or revoked_at is not null
         or created_at < now() - (${days} * interval '1 day')
      returning id
    `;
    return { clips: deleted.length, files };
  } catch {
    try {
      const deleted = await sql<{ id: string }>`
        delete from clip_links
        where (expires_at is not null and expires_at < now())
           or created_at < now() - (${days} * interval '1 day')
        returning id
      `;
      return { clips: deleted.length, files };
    } catch {
      return { clips: 0, files };
    }
  }
}

async function expireStaleJobs(): Promise<number> {
  const sql = await sqlClient();
  let n = 0;
  try {
    const rows = await sql<{ c: number }>`
      select count(*)::int as c from download_jobs
      where status = 'completed'
        and coalesce(completed_at, finished_at, created_at) < now() - interval '24 hours'
    `;
    n = Number(rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
  try {
    const { expireCompletedJobs } = await import("../jobs/queue.server");
    await expireCompletedJobs();
  } catch {
    await sql`
      update download_jobs
      set status = 'expired',
          expired_at = coalesce(expired_at, now()),
          finished_at = coalesce(finished_at, now())
      where status = 'completed'
        and coalesce(completed_at, finished_at, created_at) < now() - interval '24 hours'
    `.catch(() => undefined);
  }
  return n;
}

async function pruneDownloadLogs(): Promise<number> {
  const sql = await sqlClient();
  const days = logRetentionDays();
  let n = 0;
  try {
    const rows = await sql<{ id: number }>`
      delete from download_logs
      where created_at < now() - (${days} * interval '1 day')
      returning id
    `;
    n += rows.length;
  } catch {
    /* table may not exist */
  }
  try {
    const rows = await sql<{ id: number }>`
      delete from app_events
      where created_at < now() - (${days} * interval '1 day')
      returning id
    `;
    n += rows.length;
  } catch {
    /* ignore */
  }
  try {
    const rows = await sql<{ id: number }>`
      delete from audit_log
      where created_at < now() - (${days} * interval '1 day')
      returning id
    `;
    n += rows.length;
  } catch {
    /* ignore */
  }
  return n;
}

function isTempName(name: string): boolean {
  return TEMP_PREFIXES.some((p) => name.startsWith(p));
}

async function dirSize(path: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    try {
      const s = await stat(path);
      return s.isFile() ? { files: 1, bytes: s.size } : { files: 0, bytes: 0 };
    } catch {
      return { files: 0, bytes: 0 };
    }
  }
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      const inner = await dirSize(child);
      files += inner.files;
      bytes += inner.bytes;
    } else if (entry.isFile()) {
      files += 1;
      try {
        bytes += (await stat(child)).size;
      } catch {
        /* skip */
      }
    }
  }
  return { files, bytes };
}

async function ageMs(path: string, now: number): Promise<number | null> {
  try {
    const s = await stat(path);
    const stamp = s.mtimeMs || s.ctimeMs || 0;
    return now - stamp;
  } catch {
    return null;
  }
}

/**
 * Idempotent: missing paths and already-deleted dirs count as zero.
 * Temp prefixes use TEMP_FILE_RETENTION_HOURS. Named job dirs use FILE_RETENTION_DAYS.
 */
export async function pruneLocalFiles(
  root = tmpdir(),
  now = Date.now(),
): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const tempMs = tempRetentionHours() * 3600 * 1000;
  const jobMs = fileRetentionDays() * 86400 * 1000;

  let names: string[] = [];
  try {
    names = await readdir(root);
  } catch {
    return { files: 0, bytes: 0 };
  }

  for (const name of names) {
    const path = join(root, name);
    const age = await ageMs(path, now);
    if (age == null) continue;
    const tempHit = isTempName(name) && age >= tempMs;
    const jobHit = JOB_DIR_NAMES.includes(name) && age >= jobMs;
    if (!tempHit && !jobHit) continue;
    const sized = await dirSize(path);
    await rm(path, { recursive: true, force: true }).catch(() => undefined);
    files += sized.files || 1;
    bytes += sized.bytes;
  }

  for (const extra of [join(root, "tmp", "jobs"), join(root, "var", "jobs")]) {
    const age = await ageMs(extra, now);
    if (age == null || age < jobMs) continue;
    const sized = await dirSize(extra);
    await rm(extra, { recursive: true, force: true }).catch(() => undefined);
    files += sized.files || 1;
    bytes += sized.bytes;
  }

  return { files, bytes };
}

export async function runCleanup(): Promise<CleanupResult> {
  if (!shouldRunCleanup()) return { ...ZERO };
  const started = Date.now();
  const clipsPart = await expireClipLinks().catch(() => ({ clips: 0, files: 0 }));
  const jobs = await expireStaleJobs().catch(() => 0);
  const logs = await pruneDownloadLogs().catch(() => 0);
  const local = await pruneLocalFiles().catch(() => ({ files: 0, bytes: 0 }));
  const files = clipsPart.files + local.files;
  const bytes = local.bytes;
  const result: CleanupResult = { clips: clipsPart.clips, jobs, logs, files, bytes };
  await logJson({
    event: "cleanup",
    status: "ok",
    durationMs: Date.now() - started,
    clips: result.clips,
    jobs: result.jobs,
    logs: result.logs,
    files: result.files,
    bytes: result.bytes,
  }).catch(() => undefined);
  return result;
}
