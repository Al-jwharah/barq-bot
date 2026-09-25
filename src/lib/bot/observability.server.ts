import { randomBytes } from "node:crypto";
import { userFailMessage } from "../jobs/retry-policy";

const SECRET_PATTERN =
  /postgres(?:ql)?:\/\/[^\s]+|xai-[A-Za-z0-9_-]{8,}|vercel_blob_rw_[A-Za-z0-9_]+|\b\d{8,12}:AA[A-Za-z0-9_-]{20,}\b|\bsbp_[A-Za-z0-9_]{16,}/gi;
const SECRET_ASSIGN =
  /\b(DATABASE_URL|TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|XAI_API_KEY|BLOB_READ_WRITE_TOKEN|BARQ_ADMIN_PIN|BARQ_JOB_SECRET|BARQ_ADMIN_PIN_HASH)\b\s*[:=]\s*\S+/gi;

export function redactSecrets(value: string): string {
  return value.replace(SECRET_PATTERN, "[redacted]").replace(SECRET_ASSIGN, "$1=[redacted]");
}

export function requestId(): string {
  return randomBytes(6).toString("hex");
}

export async function logJson(input: {
  requestId?: string;
  jobId?: string;
  userId?: string | number;
  event: string;
  durationMs?: number;
  status?: string;
  errorCode?: string;
  files?: number;
  bytes?: number;
  clips?: number;
  jobs?: number;
  logs?: number;
}) {
  const row: Record<string, unknown> = {
    event: redactSecrets(String(input.event || "log")),
  };
  if (input.requestId != null) row.requestId = redactSecrets(String(input.requestId));
  if (input.jobId != null) row.jobId = redactSecrets(String(input.jobId));
  if (input.userId != null) row.userId = redactSecrets(String(input.userId));
  if (input.durationMs != null && Number.isFinite(input.durationMs)) row.durationMs = Number(input.durationMs);
  if (input.status != null) row.status = redactSecrets(String(input.status));
  if (input.errorCode != null) row.errorCode = redactSecrets(String(input.errorCode));
  if (input.files != null && Number.isFinite(input.files)) row.files = Number(input.files);
  if (input.bytes != null && Number.isFinite(input.bytes)) row.bytes = Number(input.bytes);
  if (input.clips != null && Number.isFinite(input.clips)) row.clips = Number(input.clips);
  if (input.jobs != null && Number.isFinite(input.jobs)) row.jobs = Number(input.jobs);
  if (input.logs != null && Number.isFinite(input.logs)) row.logs = Number(input.logs);
  console.info(JSON.stringify(row));
}

export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message.split("\n")[0]! : "تعذر إكمال الطلب";
  if (/429|too many/i.test(raw)) return "طلبات كثيرة. انتظر قليلًا ثم أعد المحاولة.";
  return userFailMessage(redactSecrets(raw));
}

export async function logEvent(input: {
  requestId?: string;
  tgId?: number | string;
  action: string;
  status?: string;
  durationMs?: number;
  detail?: string;
}) {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const detail = input.detail ? redactSecrets(input.detail).slice(0, 500) : null;
    await sql`
      insert into app_events (request_id, tg_id, action, status, duration_ms, detail)
      values (
        ${input.requestId ?? null},
        ${input.tgId != null ? String(input.tgId) : null},
        ${redactSecrets(input.action)},
        ${input.status ? redactSecrets(input.status) : null},
        ${input.durationMs ?? null},
        ${detail}
      )
    `;
  } catch {
    /* table may not exist yet */
  }
}

export async function logAudit(input: {
  actorId?: number | string;
  action: string;
  target?: string;
  detail?: string;
}) {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into audit_log (actor_id, action, target, detail)
      values (
        ${input.actorId != null ? String(input.actorId) : null},
        ${redactSecrets(input.action)},
        ${input.target ? redactSecrets(input.target) : null},
        ${input.detail ? redactSecrets(input.detail).slice(0, 800) : null}
      )
    `;
  } catch {
    /* ignore */
  }
}
