import { AsyncLocalStorage } from "node:async_hooks";
import type { ChildProcess } from "node:child_process";
import { readFileSync, readlinkSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const jobAls = new AsyncLocalStorage<string>();
const children = new Map<string, Set<ChildProcess>>();
const temps = new Map<string, Set<string>>();

export function currentJobId(): string | undefined {
  return jobAls.getStore();
}

export function withJobId<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
  return jobAls.run(jobId, fn);
}

export function killGraceMs(): number {
  const n = Number(process.env.JOB_KILL_GRACE_MS ?? 1500);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 1500;
}

function childSet(jobId: string): Set<ChildProcess> {
  let set = children.get(jobId);
  if (!set) {
    set = new Set();
    children.set(jobId, set);
  }
  return set;
}

export function setJobChild(jobId: string, child: ChildProcess): void {
  if (child.exitCode != null || child.signalCode != null) return;
  const set = childSet(jobId);
  set.add(child);
  const drop = () => {
    set.delete(child);
    if (set.size === 0) children.delete(jobId);
  };
  child.once("exit", drop);
  child.once("close", drop);
}

export function hasJobProcess(jobId: string): boolean {
  const set = children.get(jobId);
  return Boolean(set && set.size > 0);
}

function safeTempPath(p: string): string | null {
  const resolved = resolve(p);
  const tmp = resolve(tmpdir());
  if (resolved === tmp) return null;
  const prefix = tmp.endsWith("/") ? tmp : `${tmp}/`;
  if (!resolved.startsWith(prefix)) return null;
  return resolved;
}

export function registerJobTemp(jobId: string, path: string): void {
  const safe = safeTempPath(path);
  if (!safe) return;
  let set = temps.get(jobId);
  if (!set) {
    set = new Set();
    temps.set(jobId, set);
  }
  set.add(safe);
}

export async function deleteJobTemps(jobId: string): Promise<void> {
  const set = temps.get(jobId);
  temps.delete(jobId);
  if (!set || set.size === 0) return;
  await Promise.all([...set].map((p) => rm(p, { recursive: true, force: true }).catch(() => undefined)));
}

function childPids(pid: number): number[] {
  try {
    const text = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim();
    if (!text) return [];
    return text
      .split(/\s+/)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

function descendants(pid: number): number[] {
  const out: number[] = [];
  const stack = [...childPids(pid)];
  const seen = new Set<number>();
  while (stack.length) {
    const c = stack.pop()!;
    if (c <= 0 || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
    stack.push(...childPids(c));
  }
  return out;
}

function cwdOf(pid: number): string | null {
  try {
    return readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalPid(pid: number, sig: NodeJS.Signals): void {
  if (pid <= 0) return;
  try {
    process.kill(pid, sig);
  } catch {
    /* already dead or not ours */
  }
}

function collectTempsFromPids(jobId: string, pids: Iterable<number>): void {
  for (const pid of pids) {
    const cwd = cwdOf(pid);
    if (cwd && /barq/i.test(cwd)) registerJobTemp(jobId, cwd);
  }
}

/**
 * SIGTERM the job's yt-dlp/ffmpeg tree, wait a grace period, then SIGKILL leftovers.
 * Deletes registered (and inferred) temp files. Cancel is not a DB-only write.
 */
export async function killJobProcess(jobId: string): Promise<boolean> {
  const set = children.get(jobId);
  children.delete(jobId);
  const procs = set ? [...set] : [];
  const roots = new Set<number>();
  for (const child of procs) {
    if (child.pid && child.pid > 0) roots.add(child.pid);
  }
  const tree: number[] = [];
  const seen = new Set<number>();
  for (const pid of roots) {
    for (const d of descendants(pid)) {
      if (!seen.has(d)) {
        seen.add(d);
        tree.push(d);
      }
    }
    if (!seen.has(pid)) {
      seen.add(pid);
      tree.push(pid);
    }
  }
  collectTempsFromPids(jobId, seen);

  if (tree.length === 0 && procs.length === 0) {
    await deleteJobTemps(jobId);
    return false;
  }

  for (const pid of tree) signalPid(pid, "SIGTERM");
  for (const child of procs) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already exited */
    }
  }

  const grace = killGraceMs();
  const deadline = Date.now() + grace;
  while (Date.now() < deadline) {
    if ([...seen].every((p) => !isAlive(p))) break;
    await new Promise((r) => setTimeout(r, 25));
  }

  for (const pid of tree) {
    if (isAlive(pid)) signalPid(pid, "SIGKILL");
  }
  for (const child of procs) {
    if (child.exitCode == null && child.signalCode == null) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already exited */
      }
    }
  }

  await deleteJobTemps(jobId);
  return true;
}
