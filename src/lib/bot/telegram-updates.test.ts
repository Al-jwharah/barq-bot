import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Sql } from "../db.ts";
import {
  claimTelegramUpdate,
  isDuplicateTelegramUpdate,
  isUniqueViolation,
  lookupTelegramUpdate,
  receiveDecision,
  shouldDispatchTelegramUpdate,
  updateTypeOf,
} from "./telegram-updates.server.ts";

type Stored = { status: string; receivedAt: number; updateType: string; error?: string | null };

function memorySql(store: Map<number, Stored>, opts?: { uniqueOnInsert?: boolean }): Sql {
  const run = async (text: string, params: unknown[]): Promise<unknown[]> => {
    const sqlText = text.replace(/\s+/g, " ").trim();
    if (/^create table/i.test(sqlText)) return [];
    if (/select status, received_at from telegram_updates where update_id/i.test(sqlText)) {
      const id = Number(params[0]);
      const row = store.get(id);
      if (!row) return [];
      return [{ status: row.status, received_at: new Date(row.receivedAt) }];
    }
    if (/^update telegram_updates/i.test(sqlText) && /status = 'received'/i.test(sqlText)) {
      const updateType = String(params[0]);
      const id = Number(params[1]);
      const row = store.get(id);
      if (row) {
        row.status = "received";
        row.updateType = updateType;
        row.receivedAt = Date.now();
        row.error = null;
      }
      return [];
    }
    if (/^insert into telegram_updates/i.test(sqlText)) {
      const id = Number(params[0]);
      const updateType = String(params[1]);
      if (opts?.uniqueOnInsert || store.has(id)) {
        const err = Object.assign(new Error("duplicate key value violates unique constraint"), {
          code: "23505",
        });
        throw err;
      }
      store.set(id, { status: "received", receivedAt: Date.now(), updateType });
      return [];
    }
    throw new Error(`unexpected sql: ${sqlText}`);
  };
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return run(text, values);
  }) as Sql;
  sql.query = (text, params = []) => run(text, params) as Promise<never[]>;
  return sql;
}

test("new update is processed, duplicate is skipped, failed can retry", () => {
  assert.equal(receiveDecision(null), "new");
  assert.equal(receiveDecision({ status: "processed", receivedAt: Date.now() }), "duplicate");
  assert.equal(receiveDecision({ status: "received", receivedAt: Date.now() }), "duplicate");
  assert.equal(receiveDecision({ status: "failed", receivedAt: Date.now() }), "retry");
  assert.equal(
    receiveDecision({ status: "received", receivedAt: Date.now() - 3 * 60 * 1000 }),
    "retry",
  );
  assert.equal(shouldDispatchTelegramUpdate("new"), true);
  assert.equal(shouldDispatchTelegramUpdate("retry"), true);
  assert.equal(shouldDispatchTelegramUpdate("duplicate"), false);
});

test("updateTypeOf maps telegram payloads", () => {
  assert.equal(updateTypeOf({ update_id: 1, message: { message_id: 1, chat: { id: 1, type: "private" } } }), "message");
  assert.equal(
    updateTypeOf({
      update_id: 2,
      callback_query: { id: "c", from: { id: 1 } },
    }),
    "callback_query",
  );
  assert.equal(updateTypeOf({ update_id: 3 }), "unknown");
});

test("duplicate update_id unique path: second claim is duplicate and does not insert again", async () => {
  const store = new Map<number, Stored>();
  const sql = memorySql(store);
  const first = await claimTelegramUpdate(sql, 99, "message");
  assert.equal(first, "new");
  assert.equal(store.size, 1);
  assert.equal(store.get(99)?.status, "received");

  const second = await claimTelegramUpdate(sql, 99, "message");
  assert.equal(second, "duplicate");
  assert.equal(store.size, 1);
  assert.equal(shouldDispatchTelegramUpdate(second), false);

  assert.equal(await isDuplicateTelegramUpdate(99, sql), false);
  assert.equal(await isDuplicateTelegramUpdate(100, sql), false);
  store.get(99)!.status = "processed";
  assert.equal(await isDuplicateTelegramUpdate(99, sql), true);
});

test("unique violation (23505) on insert is treated as duplicate, not thrown", async () => {
  const store = new Map<number, Stored>();
  const sql = memorySql(store, { uniqueOnInsert: true });
  const kind = await claimTelegramUpdate(sql, 7, "message");
  assert.equal(kind, "duplicate");
  assert.equal(store.size, 0);
});

test("unique violation message without pg code is still duplicate", () => {
  assert.equal(isUniqueViolation({ code: "23505" }), true);
  assert.equal(isUniqueViolation(new Error("UNIQUE constraint failed: telegram_updates.update_id")), true);
  assert.equal(isUniqueViolation(new Error("duplicate key value")), true);
  assert.equal(isUniqueViolation(new Error("connection refused")), false);
});

test("failed update_id can retry; processed cannot; lookup does not create a row", async () => {
  const store = new Map<number, Stored>([
    [11, { status: "failed", receivedAt: Date.now(), updateType: "message", error: "boom" }],
    [12, { status: "processed", receivedAt: Date.now(), updateType: "message" }],
  ]);
  const sql = memorySql(store);
  assert.equal(await claimTelegramUpdate(sql, 11, "callback_query"), "retry");
  assert.equal(store.get(11)?.status, "received");
  assert.equal(store.get(11)?.error, null);
  assert.equal(await claimTelegramUpdate(sql, 12, "message"), "duplicate");
  assert.equal(store.get(12)?.status, "processed");
  assert.equal((await lookupTelegramUpdate(sql, 404)) === null, true);
});

test("stale in-flight received update is retried", async () => {
  const store = new Map<number, Stored>([
    [21, { status: "received", receivedAt: Date.now() - 3 * 60 * 1000, updateType: "message" }],
  ]);
  const sql = memorySql(store);
  assert.equal(await claimTelegramUpdate(sql, 21, "message"), "retry");
  assert.ok(Date.now() - (store.get(21)?.receivedAt ?? 0) < 1000);
});

test("processed_updates stays dropped in 0020 and is not resurrected", () => {
  const drop = readFileSync("migrations/0020_ops2.sql", "utf8");
  assert.match(drop, /drop table if exists processed_updates/);

  const later = readdirSync("migrations")
    .filter((name) => /^\d+_/.test(name) && name >= "0021")
    .map((name) => readFileSync(join("migrations", name), "utf8"))
    .join("\n");
  assert.equal(/create table.*processed_updates/i.test(later), false);

  const src = readFileSync("src/lib/bot/telegram-updates.server.ts", "utf8");
  assert.equal(src.includes("processed_updates"), false);
  const route = readFileSync("src/routes/api/telegram.ts", "utf8");
  assert.equal(route.includes("processed_updates"), false);
});
