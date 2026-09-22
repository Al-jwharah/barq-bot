import { createFileRoute } from "@tanstack/react-router";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_LOGIN_ENABLED, BOT_USERNAME } from "@/lib/bot/config.server";
import {
  verifyTelegramLoginHash,
  type TelegramLoginPayload,
} from "@/lib/web/telegram-login";
import { getSql } from "@/lib/db";

/**
 * D3 — Telegram Login Widget callback (B2 scaffold).
 * Proposed ENV: TELEGRAM_BOT_TOKEN, BARQ_BOT_USERNAME, BARQ_TELEGRAM_LOGIN_ENABLED,
 * BARQ_TELEGRAM_LOGIN_DOMAIN, BARQ_TELEGRAM_LOGIN_MAX_AGE_SEC
 */
export const Route = createFileRoute("/api/telegram-auth")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          enabled: TELEGRAM_LOGIN_ENABLED,
          botUsername: BOT_USERNAME,
          env: {
            required: [
              "TELEGRAM_BOT_TOKEN",
              "BARQ_BOT_USERNAME",
              "BARQ_TELEGRAM_LOGIN_ENABLED",
              "BARQ_TELEGRAM_LOGIN_DOMAIN",
            ],
            optional: ["BARQ_TELEGRAM_LOGIN_MAX_AGE_SEC"],
          },
          note: TELEGRAM_LOGIN_ENABLED
            ? "Widget login live"
            : "Scaffold only — enable flag + BotFather /setdomain",
        }),
      POST: async ({ request }) => {
        if (!TELEGRAM_LOGIN_ENABLED) {
          return Response.json(
            {
              ok: false,
              disabled: true,
              error: "Telegram Login غير مفعّل (BARQ_TELEGRAM_LOGIN_ENABLED=off)",
              envNeeded: [
                "BARQ_TELEGRAM_LOGIN_ENABLED=on",
                "BARQ_TELEGRAM_LOGIN_DOMAIN=<your-domain>",
                "BotFather /setdomain",
              ],
            },
            { status: 503 },
          );
        }
        let body: TelegramLoginPayload;
        try {
          body = (await request.json()) as TelegramLoginPayload;
        } catch {
          return Response.json({ error: "bad json" }, { status: 400 });
        }
        const maxAge = Number(process.env.BARQ_TELEGRAM_LOGIN_MAX_AGE_SEC ?? 86400) || 86400;
        const verified = verifyTelegramLoginHash(body, TELEGRAM_BOT_TOKEN, maxAge);
        if (!verified.ok) {
          return Response.json({ ok: false, error: verified.reason }, { status: 401 });
        }
        const tgId = verified.tgId;
        let files: Array<{ url: string; title: string | null; platform: string | null; at: string }> = [];
        try {
          const sql = await getSql();
          const rows = await sql<{ url: string; title: string | null; platform: string | null; created_at: string }>`
            select url, title, platform, created_at::text
            from download_logs
            where tg_id = ${tgId} and ok = true
            order by created_at desc
            limit 30
          `;
          files = rows.map((f) => ({
            url: f.url,
            title: f.title,
            platform: f.platform,
            at: f.created_at,
          }));
        } catch {
          files = [];
        }
        return Response.json({
          ok: true,
          user: {
            tgId,
            firstName: body.first_name ?? null,
            username: body.username ?? null,
            photoUrl: body.photo_url ?? null,
          },
          library: files,
        });
      },
    },
  },
});
