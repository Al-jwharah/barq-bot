import { createFileRoute } from "@tanstack/react-router";
import { maybeHourlyReminder } from "@/lib/bot/remind.server";

export const Route = createFileRoute("/api/remind")({
  server: {
    handlers: {
      GET: async () => {
        const sent = await maybeHourlyReminder().catch(() => false);
        return Response.json({ ok: true, sent });
      },
    },
  },
});
