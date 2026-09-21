import { createFileRoute } from "@tanstack/react-router";
import { botHealth } from "@/lib/bot/webhook.server";

export const Route = createFileRoute("/api/status")({
  server: {
    handlers: {
      GET: async () => Response.json(await botHealth()),
    },
  },
});
