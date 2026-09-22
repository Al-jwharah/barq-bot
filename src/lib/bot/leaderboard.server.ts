/**
 * B4 Weekly leaderboard — built behind BARQ_LEADERBOARD_LIVE (default OFF).
 * Do not enable for production until Squad C reports 48h no new failures.
 */

import { getSql } from "@/lib/db";
import { LEADERBOARD_LIVE } from "./config.server";
import { leaderboardGatedMessage } from "./engagement";

export type LeaderboardRow = {
  tg_id: string;
  downloads: number;
  rank: number;
};

export function leaderboardLive(): boolean {
  return LEADERBOARD_LIVE;
}

export async function weeklyLeaderboard(limit = 10): Promise<LeaderboardRow[]> {
  const cap = Math.min(Math.max(Math.trunc(limit) || 10, 1), 50);
  const sql = await getSql();
  const rows = await sql<{ tg_id: string; downloads: number }>`
    select tg_id, count(*)::int as downloads
    from download_logs
    where ok = true
      and created_at >= date_trunc('week', timezone('Asia/Riyadh', now())) at time zone 'Asia/Riyadh'
    group by tg_id
    order by downloads desc
    limit ${cap}
  `.catch(() => []);
  return rows.map((r, i) => ({
    tg_id: String(r.tg_id),
    downloads: Number(r.downloads ?? 0),
    rank: i + 1,
  }));
}

export function formatLeaderboard(rows: LeaderboardRow[], live: boolean): string {
  if (!live) return leaderboardGatedMessage();
  if (!rows.length) return "لوحة المتصدرين الأسبوعية ⚡️\nلا تحميلات هذا الأسبوع بعد.";
  const lines = rows.map((r) => `${r.rank}. ${maskTg(r.tg_id)} — ${r.downloads}`);
  return `لوحة المتصدرين الأسبوعية ⚡️\n(منتصف أسبوع توقيت الرياض)\n\n${lines.join("\n")}`;
}

function maskTg(id: string): string {
  if (id.length <= 4) return `…${id}`;
  return `…${id.slice(-4)}`;
}

export async function leaderboardPayload(limit = 10): Promise<{
  live: boolean;
  rows: LeaderboardRow[];
  message: string;
}> {
  const live = leaderboardLive();
  if (!live) {
    return { live: false, rows: [], message: leaderboardGatedMessage() };
  }
  const rows = await weeklyLeaderboard(limit);
  return { live: true, rows, message: formatLeaderboard(rows, true) };
}
