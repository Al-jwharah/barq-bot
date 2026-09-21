import { getSql } from "@/lib/db";

export const POINT_REWARDS = {
  download: 1,
  rating: 5,
  share: 5,
  invite: 20,
  ai: 2,
} as const;

export const REDEEM_COST = 100;
export const REDEEM_BONUS_DOWNLOADS = 3;

export type PointKind = keyof typeof POINT_REWARDS;

async function ensure() {
  const sql = await getSql();
  await sql`
    create table if not exists barq_points (
      tg_id text primary key,
      balance int not null default 0,
      earned int not null default 0,
      spent int not null default 0,
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists barq_point_ledger (
      id bigserial primary key,
      tg_id text not null,
      kind text not null,
      delta int not null,
      created_at timestamptz not null default now()
    )
  `;
}

export async function pointsBalance(tgId: number | string): Promise<number> {
  await ensure();
  const sql = await getSql();
  const rows = await sql<{ balance: number }>`select balance from barq_points where tg_id = ${String(tgId)}`;
  return Number(rows[0]?.balance ?? 0);
}

export async function awardPoints(tgId: number | string, kind: PointKind): Promise<number> {
  const delta = POINT_REWARDS[kind];
  await ensure();
  const sql = await getSql();
  const id = String(tgId);
  await sql`
    insert into barq_points (tg_id, balance, earned)
    values (${id}, ${delta}, ${delta})
    on conflict (tg_id) do update set
      balance = barq_points.balance + ${delta},
      earned = barq_points.earned + ${delta},
      updated_at = now()
  `;
  await sql`insert into barq_point_ledger (tg_id, kind, delta) values (${id}, ${kind}, ${delta})`.catch(() => undefined);
  const rows = await sql<{ balance: number }>`select balance from barq_points where tg_id = ${id}`;
  return Number(rows[0]?.balance ?? delta);
}

export async function redeemPoints(tgId: number | string): Promise<{ ok: boolean; message: string; balance: number }> {
  await ensure();
  const sql = await getSql();
  const id = String(tgId);
  const rows = await sql<{ balance: number }>`
    update barq_points
    set balance = balance - ${REDEEM_COST}, spent = spent + ${REDEEM_COST}, updated_at = now()
    where tg_id = ${id} and balance >= ${REDEEM_COST}
    returning balance
  `;
  if (!rows[0]) {
    const bal = await pointsBalance(tgId);
    return { ok: false, balance: bal, message: `رصيدك ${bal} نقطة. تحتاج ${REDEEM_COST} لاستبدال 3 تحميلات.` };
  }
  await sql`
    insert into referrals (tg_id, code, bonus_downloads)
    values (${id}, ${"p" + id}, ${REDEEM_BONUS_DOWNLOADS})
    on conflict (tg_id) do update set bonus_downloads = referrals.bonus_downloads + ${REDEEM_BONUS_DOWNLOADS}
  `.catch(() => undefined);
  return {
    ok: true,
    balance: Number(rows[0].balance),
    message: `تم: 3 تحميلات إضافية. رصيدك ${rows[0].balance} نقطة.`,
  };
}
