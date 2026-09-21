import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { JOB_MAX_ATTEMPTS, jobSecret } from "../bot/config.server";
import { internalOrigin } from "../bot/origin";
import { makeJobKey, normalizeDownloadUrl } from "./job-key";
import { killJobProcess } from "./proc-registry";
import {
  ACTIVE_JOB_STATUSES,
  canActorCancel,
  canTransition,
  errorCodeOf,
  errorMessageSafe,
  isJobStatus,
  jobTimeoutMs,
  stampColumn,
  type JobStatus,
} from "./job-status";

export type { JobStatus };
export { ACTIVE_JOB_STATUSES, canActorCancel, canTransition, jobTimeoutMs };

/** Postgres lock so two workers cannot claim the same pending row. */
export const POSTGRES_CLAIM_LOCK = "for update skip locked";

/** SELECT used by claimNextJob. `postgres=true` (Neon) always SKIP LOCKED. */
export function claimNextJobSelectSql(byId: boolean, postgres = true): string {
  const lock = postgres ? POSTGRES_CLAIM_LOCK : "for update";
  if (byId) {
    return `select * from download_jobs
           where id = $1 and status = 'pending'
             and (retry_at is null or retry_at <= now())
           ${lock}
           limit 1`;
  }
  return `select * from download_jobs
           where status = 'pending'
             and (retry_at is null or retry_at <= now())
           order by coalesce(priority, 0) desc, created_at asc
           ${lock}
           limit 1`;
}

/** Heartbeat stamp applied immediately after a successful claim. */
export const CLAIM_HEARTBEAT_SQL =
  "update download_jobs set worker_id = $1, last_heartbeat_at = now() where id = $2";

export type DownloadJob = {
  id: string;
  tg_id: string;
  chat_id: string;
  url: string;
  platform: string | null;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  status_message_id: number | null;
  error: string | null;
  error_code: string | null;
  error_message_safe: string | null;
  update_id: number | null;
  job_key: string | null;
  quota_applied: boolean;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  expired_at: string | null;
  finished_at: string | null;
  retry_at: string | null;
  worker_id: string | null;
  last_heartbeat_at: string | null;
  priority?: number;
};

export type EnqueueResult = { job: DownloadJob; reused: boolean; denied?: never } | { denied: "cap" | "queue"; retryAfter: number; job?: undefined; reused?: never };

async function sqlClient() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

let ensured = false;
async function ensure() {
  if (ensured) return;
  const sql = await sqlClient();
  await sql`
    create table if not exists download_jobs (
      id text primary key,
      tg_id text not null,
      chat_id text not null,
      url text not null,
      platform text,
      status text not null default 'pending',
      attempts integer not null default 0,
      max_attempts integer not null default 3,
      status_message_id integer,
      error text,
      created_at timestamptz not null default now(),
      started_at timestamptz,
      finished_at timestamptz
    )
  `;
  await sql`alter table download_jobs add column if not exists update_id bigint`;
  await sql`alter table download_jobs add column if not exists job_key text`;
  await sql`alter table download_jobs add column if not exists quota_applied boolean not null default false`;
  await sql`alter table download_jobs add column if not exists completed_at timestamptz`;
  await sql`alter table download_jobs add column if not exists failed_at timestamptz`;
  await sql`alter table download_jobs add column if not exists cancelled_at timestamptz`;
  await sql`alter table download_jobs add column if not exists expired_at timestamptz`;
  await sql`alter table download_jobs add column if not exists error_code text`;
  await sql`alter table download_jobs add column if not exists error_message_safe text`;
  await sql`alter table download_jobs add column if not exists retry_at timestamptz`;
  await sql`alter table download_jobs add column if not exists worker_id text`;
  await sql`alter table download_jobs add column if not exists last_heartbeat_at timestamptz`;
  await sql`alter table download_jobs add column if not exists priority integer not null default 0`;
  await sql`update download_jobs set status = 'cancelled', error_code = coalesce(error_code, 'blocked') where status = 'blocked'`;
  await sql`create unique index if not exists download_jobs_update_id_uidx on download_jobs (update_id)`;
  await sql`
    create unique index if not exists download_jobs_active_key_uidx
    on download_jobs (job_key)
    where status in ('pending', 'processing', 'uploading') and job_key is not null
  `;
  ensured = true;
}

function row(r: Record<string, unknown>): DownloadJob {
  return {
    id: String(r.id),
    tg_id: String(r.tg_id),
    chat_id: String(r.chat_id),
    url: String(r.url),
    platform: (r.platform as string | null) ?? null,
    status: isJobStatus(String(r.status)) ? (r.status as JobStatus) : "pending",
    attempts: Number(r.attempts ?? 0),
    max_attempts: Number(r.max_attempts ?? JOB_MAX_ATTEMPTS),
    status_message_id: r.status_message_id != null ? Number(r.status_message_id) : null,
    error: (r.error_message_safe as string | null) ?? (r.error as string | null) ?? null,
    error_code: (r.error_code as string | null) ?? null,
    error_message_safe: (r.error_message_safe as string | null) ?? (r.error as string | null) ?? null,
    update_id: r.update_id != null ? Number(r.update_id) : null,
    job_key: (r.job_key as string | null) ?? null,
    quota_applied: Boolean(r.quota_applied),
    created_at: String(r.created_at ?? ""),
    started_at: r.started_at ? String(r.started_at) : null,
    completed_at: r.completed_at ? String(r.completed_at) : null,
    failed_at: r.failed_at ? String(r.failed_at) : null,
    cancelled_at: r.cancelled_at ? String(r.cancelled_at) : null,
    expired_at: r.expired_at ? String(r.expired_at) : null,
    finished_at: r.finished_at ? String(r.finished_at) : null,
    retry_at: r.retry_at ? String(r.retry_at) : null,
    worker_id: (r.worker_id as string | null) ?? null,
    last_heartbeat_at: r.last_heartbeat_at ? String(r.last_heartbeat_at) : null,
    priority: Number(r.priority ?? 0),
  };
}

function isUniqueErr(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const msg = err instanceof Error ? err.message : "";
  return code === "23505" || /duplicate|unique/i.test(msg);
}

async function findActiveByKey(sql: Awaited<ReturnType<typeof sqlClient>>, jobKey: string) {
  const rows = await sql<Record<string, unknown>>`
    select * from download_jobs
    where job_key = ${jobKey}
      and status in ('pending', 'processing', 'uploading')
    order by created_at desc
    limit 1
  `;
  return rows[0] ? row(rows[0]) : null;
}

export async function enqueueDownload(input: {
  tgId: number | string;
  chatId: number;
  url: string;
  statusMessageId?: number;
  updateId?: number;
  priority?: number;
}): Promise<EnqueueResult | null> {
  await ensure();
  const id = randomBytes(9).toString("hex");
  const normalized = normalizeDownloadUrl(input.url);
  const jobKey = makeJobKey(input.tgId, normalized);
  const { withTransaction } = await import("@/lib/db");
  const { claimTelegramUpdate } = await import("../bot/telegram-updates.server");
  const { isOwnerId, DAILY_CAP } = await import("../bot/config.server");
  const { botSettings } = await import("../bot/settings.server");
  const capOn = (await botSettings()).dailyCapOn && !isOwnerId(input.tgId);

  return withTransaction(async (sql) => {
    if (input.updateId != null) {
      const kind = await claimTelegramUpdate(sql, input.updateId, "message");
      if (kind === "duplicate") return null;
    }

    const active = await findActiveByKey(sql, jobKey);
    if (active) return { job: active, reused: true };

    const depth = await sql<{ c: number }>`select count(*)::int as c from download_jobs where status = 'pending'`;
    if (Number(depth[0]?.c ?? 0) >= 80) return { denied: "queue", retryAfter: 30 };

    if (capOn) {
      const { takeUsage } = await import("../bot/usage.server");
      const used = await takeUsage(input.tgId, "download", DAILY_CAP, sql);
      if (!used.ok) return { denied: "cap", retryAfter: used.retryAfter };
    }

    try {
      await sql`
        insert into download_jobs (id, tg_id, chat_id, url, status, max_attempts, status_message_id, update_id, job_key, priority)
        values (
          ${id},
          ${String(input.tgId)},
          ${String(input.chatId)},
          ${normalized},
          'pending',
          ${JOB_MAX_ATTEMPTS},
          ${input.statusMessageId ?? null},
          ${input.updateId ?? null},
          ${jobKey},
          ${input.priority ?? 0}
        )
      `;
    } catch (err) {
      if (isUniqueErr(err)) {
        const existing = await findActiveByKey(sql, jobKey);
        if (existing) return { job: existing, reused: true };
        return null;
      }
      throw err;
    }
    const rows = await sql<Record<string, unknown>>`select * from download_jobs where id = ${id}`;
    return { job: row(rows[0]!), reused: false };
  });
}

export async function setJobStatusMessage(id: string, messageId: number) {
  const sql = await sqlClient();
  await sql`update download_jobs set status_message_id = ${messageId} where id = ${id}`;
}

type SqlClient = Awaited<ReturnType<typeof sqlClient>>;

export async function transitionJob(
  id: string,
  to: JobStatus,
  opts?: {
    error?: string;
    errorCode?: string;
    bumpAttempts?: boolean;
    sql?: SqlClient;
  },
): Promise<DownloadJob | null> {
  const run = async (sql: SqlClient) => {
    const current = await sql<{ status: string }>`select status from download_jobs where id = ${id} for update`;
    const fromRaw = current[0]?.status;
    if (!fromRaw || !isJobStatus(fromRaw)) return null;
    if (!canTransition(fromRaw, to)) return null;
    const safe = opts?.error ? errorMessageSafe(opts.error) : null;
    const code = opts?.errorCode || (opts?.error ? errorCodeOf(opts.error) : null);
    const stamp = stampColumn(to);
    const sets = ["status = $2"];
    if (opts?.bumpAttempts) sets.push("attempts = attempts + 1");
    if (stamp === "started_at") sets.push("started_at = coalesce(started_at, now())");
    else if (stamp) {
      sets.push(`${stamp} = now()`);
      sets.push("finished_at = now()");
    }
    sets.push("error = coalesce($3, error)");
    sets.push("error_code = coalesce($4, error_code)");
    sets.push("error_message_safe = coalesce($3, error_message_safe)");
    const rows = await sql.query<Record<string, unknown>>(
      `update download_jobs set ${sets.join(", ")} where id = $1 and status = $5 returning *`,
      [id, to, safe, code, fromRaw],
    );
    return rows[0] ? row(rows[0]) : null;
  };
  if (opts?.sql) return run(opts.sql);
  const { withTransaction } = await import("@/lib/db");
  return withTransaction(run);
}

export async function markJobUploading(id: string) {
  return transitionJob(id, "uploading");
}

export async function expireCompletedJobs() {
  const sql = await sqlClient();
  const rows = await sql<{ id: string }>`
    select id from download_jobs
    where status = 'completed'
      and coalesce(completed_at, finished_at, created_at) < now() - interval '24 hours'
  `;
  for (const r of rows) {
    await transitionJob(r.id, "expired").catch(() => undefined);
  }
}

export async function reclaimStuckJobs() {
  const sql = await sqlClient();
  const timeoutMs = jobTimeoutMs();
  const rows = await sql.query<{ id: string; attempts: number; max_attempts: number }>(
    `select id, attempts, max_attempts from download_jobs
     where status in ('processing', 'uploading')
       and started_at is not null
       and coalesce(last_heartbeat_at, started_at) < now() - ($1 * interval '1 millisecond')`,
    [timeoutMs],
  );
  for (const r of rows) {
    await killJobProcess(r.id).catch(() => false);
    const failed = await transitionJob(r.id, "failed", { error: "stuck", errorCode: "stuck" });
    if (failed && r.attempts < r.max_attempts) {
      await transitionJob(r.id, "pending");
    }
  }
}

export async function claimNextJob(id?: string): Promise<DownloadJob | null> {
  await ensure();
  await reclaimStuckJobs().catch(() => undefined);
  await expireCompletedJobs().catch(() => undefined);
  const { withTransaction } = await import("@/lib/db");
  return withTransaction(async (sql) => {
    const { dbSource } = await import("@/lib/db");
    const postgres = dbSource === "neon";
    const workerId = process.env.VERCEL_REGION || hostname().slice(0, 32);
    // Retry: SELECT SKIP LOCKED can hand us a row another worker already moved
    // off pending; UPDATE ... status = 'pending' is the real unique claim.
    for (let spin = 0; spin < 8; spin += 1) {
      const pending = id
        ? await sql.query<Record<string, unknown>>(claimNextJobSelectSql(Boolean(id), postgres), [id])
        : await sql.query<Record<string, unknown>>(claimNextJobSelectSql(false, postgres));
      const current = pending[0] ? row(pending[0]) : null;
      if (!current) return null;
      const claimed = await sql.query<Record<string, unknown>>(
        `update download_jobs
         set status = 'processing',
             attempts = attempts + 1,
             started_at = coalesce(started_at, now()),
             worker_id = $2,
             last_heartbeat_at = now()
         where id = $1 and status = 'pending'
           and (retry_at is null or retry_at <= now())
         returning *`,
        [current.id, workerId],
      );
      const next = claimed[0] ? row(claimed[0]) : null;
      if (!next) {
        if (id) return null;
        continue;
      }
      next.worker_id = workerId;
      next.last_heartbeat_at = new Date().toISOString();
      await sql`
        insert into job_attempts (job_id, attempt, status)
        values (${next.id}, ${next.attempts}, 'processing')
        on conflict (job_id, attempt) do update set status = 'processing', started_at = now()
      `.catch(() => undefined);
      return next;
    }
    return null;
  });
}

export async function finishJob(id: string, status: JobStatus, error?: string): Promise<boolean> {
  const next = await transitionJob(
    id,
    status,
    error ? { error, errorCode: errorCodeOf(error) } : undefined,
  );
  return Boolean(next);
}

export async function applyJobQuota(id: string): Promise<boolean> {
  const sql = await sqlClient();
  const rows = await sql<{ id: string }>`
    update download_jobs
    set quota_applied = true
    where id = ${id} and quota_applied = false
    returning id
  `;
  return rows.length > 0;
}

export async function retryOrFail(job: DownloadJob, error: string): Promise<"retry" | "failed"> {
  const { shouldRetry, retryDelayMs } = await import("./retry-policy");
  const retry = shouldRetry(error, job.attempts, job.max_attempts);
  const failed = await transitionJob(job.id, "failed", {
    error: errorMessageSafe(error.split("\n")[0] ?? error),
    errorCode: errorCodeOf(error),
  });
  if (!failed) return "failed";
  if (!retry) return "failed";
  const pending = await transitionJob(job.id, "pending");
  if (!pending) return "failed";
  const delay = retryDelayMs(job.attempts);
  const sql = await sqlClient();
  await sql.query(
    `update download_jobs set retry_at = now() + ($2 * interval '1 millisecond') where id = $1`,
    [job.id, delay],
  );
  return "retry";
}

export async function scheduleJobRetry(jobId: string, attemptsDone: number) {
  const { retryDelayMs } = await import("./retry-policy");
  const delay = retryDelayMs(attemptsDone);
  try {
    const { waitUntil } = await import("@vercel/functions");
    const ctx = (
      globalThis as unknown as Record<PropertyKey, { get?: () => { waitUntil?: (p: Promise<unknown>) => unknown } }>
    )[Symbol.for("@vercel/request-context")]?.get?.();
    const task = (async () => {
      await new Promise((r) => setTimeout(r, delay));
      await kickJobWorker(jobId);
    })();
    if (typeof ctx?.waitUntil === "function") {
      ctx.waitUntil(task);
    } else {
      waitUntil(task);
      // No request context: waitUntil is a silent no-op. Do not kick now —
      // retry_at is in the future so claim would miss. Keep/webhook drain later.
    }
  } catch {
    /* retry_at already set; next drain picks it up */
  }
  return delay;
}

export async function listUserJobs(tgId: number | string, limit = 8) {
  await ensure();
  const sql = await sqlClient();
  const rows = await sql<Record<string, unknown>>`
    select * from download_jobs
    where tg_id = ${String(tgId)}
    order by created_at desc
    limit ${Math.min(Math.max(limit, 1), 20)}
  `;
  return rows.map(row);
}

export async function userQueuePosition(tgId: number | string): Promise<number> {
  await ensure();
  const sql = await sqlClient();
  const rows = await sql<{ c: number }>`
    select count(*)::int as c from download_jobs
    where status in ('pending', 'processing', 'uploading')
      and created_at <= coalesce(
        (select created_at from download_jobs
         where tg_id = ${String(tgId)} and status in ('pending', 'processing', 'uploading')
         order by created_at asc limit 1),
        now()
      )
  `;
  return Number(rows[0]?.c ?? 1);
}

export async function listJobs(limit = 40) {
  await ensure();
  const sql = await sqlClient();
  const rows = await sql<Record<string, unknown>>`
    select * from download_jobs order by created_at desc limit ${limit}
  `;
  return rows.map(row);
}

export async function getJob(id: string): Promise<DownloadJob | null> {
  await ensure();
  const sql = await sqlClient();
  const rows = await sql<Record<string, unknown>>`
    select * from download_jobs where id = ${id} limit 1
  `;
  return rows[0] ? row(rows[0]) : null;
}

export async function cancelJob(id: string, tgId: number): Promise<boolean> {
  const job = await getJob(id);
  if (!job) return false;
  const { isOwnerId } = await import("../bot/config.server");
  if (!canActorCancel(job.tg_id, tgId, isOwnerId(tgId), job.status)) return false;
  const cancelled = await transitionJob(id, "cancelled", {
    error: "cancelled",
    errorCode: "cancelled",
  });
  // Kill yt-dlp/ffmpeg (SIGTERM then SIGKILL) and drop temp files — cancel is not DB-only.
  await killJobProcess(id).catch(() => false);
  return Boolean(cancelled);
}

export async function retryJobById(id: string): Promise<DownloadJob> {
  const job = await getJob(id);
  if (!job) throw new Error("المهمة غير موجودة");
  if (job.status !== "failed") throw new Error("إعادة المحاولة للفشل فقط");
  const next = await transitionJob(id, "pending");
  if (!next) throw new Error("تعذر إعادة المحاولة");
  await kickJobWorker(id);
  return next;
}

export type JobCounts = {
  pending: number;
  processing: number;
  uploading: number;
  completed: number;
  failed: number;
  cancelled: number;
  expired: number;
  avgSeconds: number;
  failedToday: number;
  oldestProcessingSeconds: number;
};

export async function jobStats(): Promise<JobCounts> {
  await ensure();
  const sql = await sqlClient();
  const rows = await sql<{ status: string; c: number }>`
    select status, count(*)::int as c from download_jobs group by status
  `;
  const out: JobCounts = {
    pending: 0,
    processing: 0,
    uploading: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    expired: 0,
    avgSeconds: 0,
    failedToday: 0,
    oldestProcessingSeconds: 0,
  };
  for (const r of rows) {
    if (
      r.status === "pending" ||
      r.status === "processing" ||
      r.status === "uploading" ||
      r.status === "completed" ||
      r.status === "failed" ||
      r.status === "cancelled" ||
      r.status === "expired"
    ) {
      out[r.status] = Number(r.c);
    }
  }
  const dur = await sql<{ avg: number | null }>`
    select avg(extract(epoch from (completed_at - started_at)))::float as avg
    from download_jobs
    where status in ('completed', 'expired') and started_at is not null and completed_at is not null
  `;
  out.avgSeconds = Number(dur[0]?.avg ?? 0);
  const failed = await sql<{ c: number }>`
    select count(*)::int as c from download_jobs
    where status = 'failed' and coalesce(failed_at, created_at) >= date_trunc('day', now())
  `;
  out.failedToday = Number(failed[0]?.c ?? 0);
  const old = await sql<{ sec: number | null }>`
    select extract(epoch from (now() - min(started_at)))::float as sec
    from download_jobs where status in ('processing', 'uploading') and started_at is not null
  `;
  out.oldestProcessingSeconds = Number(old[0]?.sec ?? 0);
  return out;
}

export async function kickJobWorker(jobId?: string): Promise<boolean> {
  const secret = jobSecret();
  const origin = internalOrigin();
  if (!origin) return false;
  const url = `${origin}/api/jobs`;
  const run = fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-barq-job": secret },
    body: JSON.stringify({ id: jobId, secret }),
    signal: AbortSignal.timeout(25000),
  }).then(async (res) => {
    if (res.ok) return;
    const { drainJobs, processDownloadJob } = await import("./worker.server");
    if (jobId) await processDownloadJob(jobId);
    else await drainJobs();
  }).catch(async () => {
    try {
      const { drainJobs, processDownloadJob } = await import("./worker.server");
      if (jobId) await processDownloadJob(jobId);
      else await drainJobs();
    } catch {
      /* isolate freeze */
    }
  });
  try {
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(run);
  } catch {
    /* Nitro may lack @vercel/request-context */
  }
  await run;
  return true;
}
