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
        const batch = msg ? [...new Set(urlsFromMessage(msg))].slice(0, 5) : [];
        if (msg && batch.length > 1) {
          const found = urlsFromMessage(msg).length;
          await telegram
            .sendMessage(
              msg.chat.id,
              found > 5
                ? `\u0648\u0635\u0644\u062a ${found} \u0631\u0648\u0627\u0628\u0637. \u0623\u062c\u0647\u0651\u0632 \u0623\u0648\u0644 5\u060c \u0643\u0644 \u0648\u0627\u062d\u062f \u0644\u062d\u0627\u0644\u0647.`
                : `\u0648\u0635\u0644\u062a ${batch.length} \u0631\u0648\u0627\u0628\u0637. \u0623\u062c\u0647\u0651\u0632\u0647\u0627 \u0648\u0627\u062d\u062f \u0648\u0627\u062d\u062f.`,
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
              .sendMessage(msg.chat.id, "\u26a1 \u0627\u0633\u062a\u0644\u0645\u062a \u0627\u0644\u0631\u0627\u0628\u0637 \u2705", {
                reply_markup: inlineKeyboard([
                  [
                    { text: "\u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u062a\u062d\u0645\u064a\u0644", callback_data: `job:cancel:${queued.job.id}` },
                    { text: "\u0637\u0627\u0628\u0648\u0631\u064a", callback_data: "lib:queue" },
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
