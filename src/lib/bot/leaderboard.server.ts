/**
 * Weekly leaderboard — gated by BARQ_LEADERBOARD_LIVE (default OFF).
 * Do not enable for production until Squad C reports 48h no new failures.
 * Prefer real Postgres query when live; demo rows when gated (website UX).
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

export { leaderboardGatedMessage };

export function demoLeaderboardRows(): LeaderboardRow[] {
  return [
    { tg_id: "demo0001", downloads: 42, rank: 1 },
    { tg_id: "demo0002", downloads: 31, rank: 2 },
    { tg_id: "demo0003", downloads: 18, rank: 3 },
  ];
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
  demo: boolean;
}> {
  const live = leaderboardLive();
  if (!live) {
    return {
      live: false,
      rows: demoLeaderboardRows(),
      message: leaderboardGatedMessage(),
      demo: true,
    };
  }
  const rows = await weeklyLeaderboard(limit);
  return { live: true, rows, message: formatLeaderboard(rows, true), demo: false };
}
