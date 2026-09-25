import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@vercel/functions";
import { flushDb } from "@/lib/db";
import { handleUpdate } from "@/lib/bot/handle.server";
import { guardTelegramRequest } from "@/lib/bot/webhook-guard";
import { inlineKeyboard, telegram, urlsFromMessage } from "@/lib/bot/telegram.server";
import { enqueueDownload, kickJobWorker, setJobStatusMessage } from "@/lib/jobs/queue.server";

function later(task: Promise<unknown>): Promise<unknown> {
  try {
    waitUntil(task);
  } catch {
    /* @vercel/functions throws only on a non-Promise */
  }
  const ctx = (
    globalThis as unknown as Record<PropertyKey, { get?: () => { waitUntil?: (p: Promise<unknown>) => unknown } }>
  )[Symbol.for("@vercel/request-context")]?.get?.();
  if (typeof ctx?.waitUntil === "function") return Promise.resolve();
  // No Vercel request context: waitUntil is a silent no-op. Await so drain runs.
  return task;
}

function methodNotAllowed() {
  return new Response("method not allowed", { status: 405 });
}

export const Route = createFileRoute("/api/telegram")({
  server: {
    handlers: {
      GET: methodNotAllowed,
      HEAD: methodNotAllowed,
      PUT: methodNotAllowed,
      PATCH: methodNotAllowed,
      DELETE: methodNotAllowed,
      OPTIONS: methodNotAllowed,
      POST: async ({ request }) => {
        const raw = await request.text();
        const guarded = guardTelegramRequest(request, raw);
        if (!guarded.ok) {
          return new Response(guarded.body, { status: guarded.status });
        }
        const msg = guarded.update.message;
        const fromId = msg ? (msg.from?.id ?? msg.chat.id) : 0;
        let linkCap = 3;
        if (msg) {
          const { hasPremium } = await import("@/lib/bot/plans.server");
          const { getMember } = await import("@/lib/bot/store.server");
          const member = await getMember(fromId).catch(() => null);
          if (hasPremium(member, fromId)) linkCap = 5;
        }
        const batch = msg ? [...new Set(urlsFromMessage(msg))].slice(0, linkCap) : [];
        if (msg && batch.length > 1) {
          const found = urlsFromMessage(msg).length;
          await telegram
            .sendMessage(
              msg.chat.id,
              found > linkCap
                ? `وصلت ${found} روابط. أجهّز أول ${linkCap}، كل واحد لحاله.`
                : `وصلت ${batch.length} روابط. أجهّزها واحد واحد.`,
            )
            .catch(() => undefined);
        }
        await handleUpdate(guarded.update).catch(() => undefined);
        if (msg && batch.length > 1) {
          const fromId = msg.from?.id ?? msg.chat.id;
          for (const url of batch.slice(1)) {
            const queued = await enqueueDownload({ tgId: fromId, chatId: msg.chat.id, url }).catch(() => null);
            if (!queued || queued.denied || queued.reused) continue;
            const status = await telegram
              .sendMessage(msg.chat.id, "⚡ استلمت الرابط ✅", {
                reply_markup: inlineKeyboard([
                  [
                    { text: "إلغاء التحميل", callback_data: `job:cancel:${queued.job.id}` },
                    { text: "طابوري", callback_data: "lib:queue" },
                  ],
                ]),
              })
              .catch(() => null);
            if (status?.message_id) {
              await setJobStatusMessage(queued.job.id, status.message_id).catch(() => undefined);
            }
            await kickJobWorker(queued.job.id).catch(() => undefined);
          }
        }
        await later(
          (async () => {
            const { drainJobs } = await import("@/lib/jobs/worker.server");
            await drainJobs();
          })().finally(() => flushDb().catch(() => undefined)),
        );
        return new Response("ok");
      },
    },
  },
});
