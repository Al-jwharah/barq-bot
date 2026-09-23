import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@vercel/functions";
import { OWNER_TG_ID, TELEGRAM_BOT_TOKEN } from "@/lib/bot/config.server";
import { secretsMatch } from "@/lib/bot/webhook-guard";
import { grokReady } from "@/lib/bot/grok.server";
import { telegram } from "@/lib/bot/telegram.server";
import { setSetting } from "@/lib/bot/store.server";
import { botHealth } from "@/lib/bot/webhook.server";
import { drainJobs } from "@/lib/jobs/worker.server";
import { flushDb } from "@/lib/db";

function later(task: Promise<unknown>) {
  try {
    waitUntil(task);
  } catch {
    void task;
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probePauseSend() {
  await setSetting("bot_paused", "on");
  await telegram.sendMessage(
    Number(OWNER_TG_ID),
    "اختبار Vercel: البوت توقف لحظيًا.\nالتوكن موجود. برق AI " +
      (grokReady() ? "جاهز" : "غير جاهز") +
      ".",
  );
  await setSetting("bot_paused", "off");
  await telegram.sendMessage(
    Number(OWNER_TG_ID),
    `عاد يعمل على Vercel ⚡️\nبرق AI: ${grokReady() ? "يعمل" : "لا"}\nالتوكن: ${TELEGRAM_BOT_TOKEN ? "مضبوط" : "ناقص"}`,
  );
  await flushDb().catch(() => undefined);
  return { probe: "ok", grok: grokReady(), token: Boolean(TELEGRAM_BOT_TOKEN), paused: false };
}

async function tick() {
  const jobs = await withTimeout(
    drainJobs().catch((err) => ({ error: err instanceof Error ? err.message : "jobs" })),
    8_000,
    { error: "timeout" } as { error: string },
  );
  later(
    (async () => {
      const { expireCompletedJobs } = await import("@/lib/jobs/queue.server");
      const { expireOldClips } = await import("@/lib/bot/store.server");
      const { runCleanup } = await import("@/lib/bot/cleanup.server");
      const { runHourlyAds } = await import("@/lib/bot/ads.server");
      const { runOpsAlerts } = await import("@/lib/bot/ops.server");
      const { runComebacks } = await import("@/lib/bot/growth.server");
      const { pollLiveFollows } = await import("@/lib/bot/live.server");
      const { runDailyBackup } = await import("@/lib/bot/backup-cron.server");
      await expireCompletedJobs().catch(() => undefined);
      await expireOldClips().catch(() => undefined);
      await runCleanup().catch(() => undefined);
      await runHourlyAds().catch(() => undefined);
      await runOpsAlerts().catch(() => undefined);
      await runComebacks().catch(() => undefined);
      const { cleanupFileCache } = await import("@/lib/bot/file-cache.server");
      await pollLiveFollows().catch(() => undefined);
      await runDailyBackup().catch(() => undefined);
      await cleanupFileCache().catch(() => undefined);
      const { maybeHourlyReminder } = await import("@/lib/bot/remind.server");
      await maybeHourlyReminder().catch(() => undefined);
      await flushDb().catch(() => undefined);
    })(),
  );
  const health = await botHealth().catch((err) => ({
    running: false,
    lastError: err instanceof Error ? err.message : "health",
  }));
  return { ...health, jobs };
}

export const Route = createFileRoute("/api/keep")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const probe = new URL(request.url).searchParams.get("probe");
        const job = typeof process !== "undefined" ? process.env.BARQ_JOB_SECRET?.trim() ?? "" : "";
        if (probe && job && secretsMatch(probe, job)) {
          const result = await probePauseSend();
          return Response.json(result);
        }
        return Response.json(await tick());
      },
      POST: async () => Response.json(await tick()),
    },
  },
});
