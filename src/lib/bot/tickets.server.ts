import { randomBytes } from "node:crypto";
import { isOwnerId } from "./config.server";

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export type SupportTicket = {
  id: string;
  user_id: string;
  job_id: string | null;
  subject: string | null;
  message: string;
  status: string;
  assigned_to: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export function makeTicketId(): string {
  const bytes = randomBytes(6);
  let suffix = "";
  for (let i = 0; i < 6; i += 1) suffix += ALNUM[bytes[i]! % ALNUM.length];
  return `BRQ-${suffix}`;
}

export function userCanSeeTicket(viewerId: string, ownerId: string, isOwner: boolean): boolean {
  if (isOwner) return true;
  return String(viewerId) === String(ownerId);
}

export function userCanSee(tgId: number | string, ticket: { user_id: string }): boolean {
  const viewer = String(tgId);
  return userCanSeeTicket(viewer, String(ticket.user_id), isOwnerId(viewer));
}

async function sqlClient() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function rowToTicket(r: Record<string, unknown>): SupportTicket {
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    job_id: r.job_id != null ? String(r.job_id) : null,
    subject: r.subject != null ? String(r.subject) : null,
    message: String(r.message ?? ""),
    status: String(r.status ?? "open"),
    assigned_to: r.assigned_to != null ? String(r.assigned_to) : null,
    error_code: r.error_code != null ? String(r.error_code) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
    resolved_at: r.resolved_at != null ? String(r.resolved_at) : null,
  };
}

export async function openTicket(input: {
  tgId: number | string;
  message: string;
  jobId?: string;
  subject?: string;
}): Promise<string | null> {
  const id = makeTicketId();
  const sql = await sqlClient().catch(() => null);
  if (!sql) return null;
  const rows = await sql<{ id: string }>`
    insert into support_tickets (id, user_id, job_id, subject, message)
    values (
      ${id},
      ${String(input.tgId)},
      ${input.jobId ?? null},
      ${input.subject ?? null},
      ${input.message}
    )
    returning id
  `.catch(() => [] as { id: string }[]);
  return rows[0]?.id ?? null;
}

export async function listTicketsForUser(tgId: number | string): Promise<SupportTicket[]> {
  const sql = await sqlClient().catch(() => null);
  if (!sql) return [];
  const rows = await sql<Record<string, unknown>>`
    select * from support_tickets
    where user_id = ${String(tgId)}
    order by created_at desc
  `.catch(() => [] as Record<string, unknown>[]);
  return rows.map(rowToTicket);
}

export async function getTicket(id: string): Promise<SupportTicket | null> {
  const sql = await sqlClient().catch(() => null);
  if (!sql) return null;
  const rows = await sql<Record<string, unknown>>`
    select * from support_tickets where id = ${id} limit 1
  `.catch(() => [] as Record<string, unknown>[]);
  return rows[0] ? rowToTicket(rows[0]) : null;
}

export async function listTickets(limit = 20): Promise<SupportTicket[]> {
  const sql = await sqlClient().catch(() => null);
  if (!sql) return [];
  const rows = await sql<Record<string, unknown>>`
    select * from support_tickets order by created_at desc limit ${limit}
  `.catch(() => [] as Record<string, unknown>[]);
  return rows.map(rowToTicket);
}
