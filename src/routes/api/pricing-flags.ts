import { createFileRoute } from "@tanstack/react-router";
import { SUBSCRIPTIONS_LIVE, SUBSCRIPTIONS_UI } from "@/lib/bot/config.server";

/** Thin flags for pricing page — never flips LIVE; UI is separate. */
export const Route = createFileRoute("/api/pricing-flags")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          live: SUBSCRIPTIONS_LIVE,
          ui: SUBSCRIPTIONS_UI,
          env: {
            BARQ_SUBSCRIPTIONS_LIVE: "keep off on production until owner launch",
            BARQ_SUBSCRIPTIONS_UI: "on = show pricing CTAs / deep-links (demo-safe)",
          },
        }),
    },
  },
});
