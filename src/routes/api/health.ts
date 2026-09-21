import { createFileRoute } from "@tanstack/react-router";
import { dbBackendLabel, dbSource, getSql } from "@/lib/db";
import { LAUNCH_MAX, MAINTENANCE, OWNER_TG_ID, secretsReady } from "@/lib/bot/config.server";
import { getPublicOrigin, webhookUrl } from "@/lib/bot/origin";
import { grokReady } from "@/lib/bot/grok.server";
import { jobStats } from "@/lib/jobs/queue.server";
import { botHealth } from "@/lib/bot/webhook.server";
import { telegram } from "@/lib/bot/telegram.server";

type OkDown = "ok" | "down";
type SoftCheck = "ok" | "down" | "unknown";
type HealthStatus = "live" | "ready" | "degraded" | "down";

const WORKER_STUCK_SECONDS = 180;

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secrets = secretsReady();
        const grok = grokReady();
        const url = new URL(request.url);
        const liveProbe = url.searchParams.get("live") === "1";
        const readyProbe = url.searchParams.get("ready") === "1";

        let dbOk = false;
        try {
          const sql = await getSql();
          await sql`select 1 as ok`;
          dbOk = true;
        } catch {
          dbOk = false;
        }

        const queue = await jobStats().catch(() => null);
        const queueCheck: SoftCheck = queue != null ? "ok" : dbOk ? "down" : "unknown";

        let workerCheck: SoftCheck = "unknown";
        if (queue == null) workerCheck = "unknown";
        else if (queue.oldestProcessingSeconds >= WORKER_STUCK_SECONDS) workerCheck = "down";
        else workerCheck = "ok";

        const storageOk = Boolean(
          typeof process !== "undefined" && process.env.BLOB_READ_WRITE_TOKEN?.trim(),
        );

        let telegramCheck: OkDown = secrets.telegram ? "ok" : "down";
        let webhookOk = false;
        let webhookUrlNow = "";
        let webhookPending = 0;
        if (secrets.telegram) {
          try {
            const info = await telegram.getWebhookInfo();
            telegramCheck = "ok";
            webhookOk = Boolean(info.url?.includes("/api/telegram"));
            webhookUrlNow = info.url ?? "";
            webhookPending = info.pending_update_count ?? 0;
          } catch {
            telegramCheck = "down";
            webhookOk = false;
          }
        }

        const ready = dbOk && secrets.telegram && secrets.webhookSecret;
        const checks = {
          database: (dbOk ? "ok" : "down") as OkDown,
          storage: (storageOk ? "ok" : "down") as OkDown,
          queue: queueCheck,
          worker: workerCheck,
          telegram: telegramCheck,
          webhook: (webhookOk ? "ok" : "down") as OkDown,
        };

        const optionalFail =
          !grok ||
          workerCheck !== "ok" ||
          queueCheck !== "ok" ||
          telegramCheck !== "ok" ||
          !webhookOk ||
          !storageOk;

        let status: HealthStatus;
        if (!dbOk) status = "down";
        else if (!ready) status = "live";
        else if (optionalFail) status = "degraded";
        else status = "ready";

        const publicBody = {
          status,
          live: true as const,
          ready,
          checks,
          postgres: dbSource === "neon",
        };

        if (readyProbe && !ready) {
          return Response.json(publicBody, { status: 503 });
        }
        if (liveProbe) {
          return Response.json(publicBody, { status: 200 });
        }

        const wantReport = url.searchParams.get("report") === "1";
        if (wantReport) {
          const { hasAdminSession } = await import("@/lib/bot/admin-session.server");
          if (await hasAdminSession()) {
            const { storageStats } = await import("@/lib/bot/ops.server");
            const storageInfo = await storageStats().catch(() => ({ blob: false, rows: 0, counts: {} }));
            const bot = await botHealth().catch(() => null);
            const origin = getPublicOrigin();
            const checklist = {
              env_telegram: secrets.telegram,
              env_grok: secrets.grok,
              env_admin: secrets.adminPin,
              env_webhook_secret: secrets.webhookSecret,
              database: dbOk,
              storage: storageOk,
              webhook: webhookOk,
              grok,
              queue: queue != null,
            };
            const lines = [
              `برق إنتاج ${ready ? "✅ جاهز للفحص" : "❌ غير مكتمل"}`,
              `DB ${checklist.database ? "ok" : "fail"} · Blob ${checklist.storage ? "ok" : "fail"}`,
              `Webhook ${checklist.webhook ? "ok" : "fail"}`,
              `Grok ${checklist.grok ? "ok" : "fail"}`,
              `طابور انتظار ${queue?.pending ?? "—"} فشل ${queue?.failed ?? "—"} متوسط ${queue?.avgSeconds ?? "—"}ث`,
            ];
            await telegram.sendMessage(Number(OWNER_TG_ID), lines.join("\n")).catch(() => undefined);
            return Response.json({
              ...publicBody,
              origin,
              webhookExpected: origin ? webhookUrl() : "",
              maintenance: MAINTENANCE,
              launchMax: LAUNCH_MAX,
              checklist,
              database: { ok: dbOk, backend: dbBackendLabel(), postgres: dbSource === "neon" },
              queue,
              storage: { blob: storageOk, rows: storageInfo.rows, counts: storageInfo.counts },
              grok,
              webhook: { ok: webhookOk, pending: webhookPending, configured: Boolean(webhookUrlNow) },
              bot: bot ? { running: bot.running, webhook: Boolean(bot.webhook), db: bot.db } : null,
            });
          }
        }

        return Response.json(publicBody);
      },
    },
  },
});
