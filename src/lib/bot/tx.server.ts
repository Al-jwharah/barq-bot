import type { Sql } from "@/lib/db";
import type { ReceiveKind } from "./telegram-updates.server";
import type { UsageAction, UsageTake } from "./usage.server";

/** One connection for unique claims, usage deducts, and job inserts. */
export async function withBotTx<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const { withTransaction } = await import("@/lib/db");
  return withTransaction(fn);
}

/**
 * Claim a telegram update and create a job on the same connection.
 * Returns null when the update is a duplicate (job must not be created).
 */
export async function txClaimUpdateAndCreateJob<T>(
  updateId: number,
  updateType: string,
  create: (sql: Sql, kind: ReceiveKind) => Promise<T>,
): Promise<T | null> {
  return withBotTx(async (sql) => {
    const { claimTelegramUpdate } = await import("./telegram-updates.server");
    const kind = await claimTelegramUpdate(sql, updateId, updateType);
    if (kind === "duplicate") return null;
    return create(sql, kind);
  });
}

/**
 * Deduct usage and create a download on the same connection.
 * If `create` throws, the deduct rolls back with the transaction.
 */
export async function txDeductUsageAndCreateDownload<T>(
  userId: number | string,
  max: number,
  create: (sql: Sql) => Promise<T>,
  action: UsageAction = "download",
): Promise<{ created: T } | { denied: UsageTake }> {
  return withBotTx(async (sql) => {
    const { takeUsage } = await import("./usage.server");
    const used = await takeUsage(userId, action, max, sql);
    if (!used.ok) return { denied: used };
    const created = await create(sql);
    return { created };
  });
}
