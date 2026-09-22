import { createFileRoute } from "@tanstack/react-router";
import { botHealth } from "@/lib/bot/webhook.server";
import { initSentry } from "@/lib/bot/sentry.server";

export const Route = createFileRoute("/api/status")({
  server: {
    handlers: {
      GET: async () => {
        initSentry();
        return Response.json(await botHealth());
      },
    },
  },
});
