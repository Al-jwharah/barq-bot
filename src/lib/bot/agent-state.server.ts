import { getSql } from "@/lib/db";
import type { AgentToolCall, AgentToolResult } from "./agent-protocol";

export async function loadPendingTool(tgId: number | string): Promise<AgentToolCall | null> {
  try {
    const sql = await getSql();
    const rows = await sql<{ pending_tool: AgentToolCall | null }>`
      select pending_tool from agent_sessions where tg_id = ${String(tgId)} limit 1
    `;
    return rows[0]?.pending_tool ?? null;
  } catch {
    return null;
  }
}

export async function savePendingTool(tgId: number | string, pending: AgentToolCall | null, summary: string) {
  const sql = await getSql();
  await sql`
    insert into agent_sessions (tg_id, summary, pending_tool, updated_at)
    values (${String(tgId)}, ${summary.slice(0, 500)}, ${pending ? JSON.stringify(pending) : null}::jsonb, now())
    on conflict (tg_id) do update set
      summary = excluded.summary,
      pending_tool = excluded.pending_tool,
      updated_at = now()
  `;
}

export async function recordAgentStep(tgId: number | string, call: AgentToolCall, result: AgentToolResult) {
  const sql = await getSql();
  await sql`
    insert into agent_steps (tg_id, tool, args, result, ok, error, job_id)
    values (
      ${String(tgId)},
      ${call.name},
      ${JSON.stringify(call.arguments)}::jsonb,
      ${JSON.stringify(result.data ?? {})}::jsonb,
      ${result.ok},
      ${result.error ?? null},
      ${result.jobId ?? null}
    )
  `;
}
