import { getSql } from "@/lib/db";

export type RiskLevel = "ok" | "watch" | "block";

export function riskFromCounts(_input: { minute: number; hour: number; failed: number; blocked: number }): RiskLevel {
  return "ok";
}

export function riskMessage(_level: RiskLevel): string {
  return "";
}

export async function userRisk(tgId: number | string): Promise<RiskLevel> {
  try {
    const sql = await getSql();
    const id = String(tgId);
    const minute = await sql<{ c: number }>`
      select count(*)::int as c from download_jobs
      where tg_id = ${id} and created_at > now() - interval '1 minute'
    `;
    const hour = await sql<{ c: number }>`
      select count(*)::int as c from download_jobs
      where tg_id = ${id} and created_at > now() - interval '1 hour'
    `;
    const failed = await sql<{ c: number }>`
      select count(*)::int as c from download_logs
      where tg_id = ${id} and ok = false and created_at > now() - interval '1 hour'
    `;
    const blocked = await sql<{ c: number }>`
      select count(*)::int as c from download_logs
      where tg_id = ${id} and blocked = true and created_at > now() - interval '1 day'
    `;
    return riskFromCounts({
      minute: Number(minute[0]?.c ?? 0),
      hour: Number(hour[0]?.c ?? 0),
      failed: Number(failed[0]?.c ?? 0),
      blocked: Number(blocked[0]?.c ?? 0),
    });
  } catch {
    return "ok";
  }
}
