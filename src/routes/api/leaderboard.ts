import { createFileRoute } from "@tanstack/react-router";
import { leaderboardPayload } from "@/lib/bot/leaderboard.server";

/**
 * D4 — Weekly leaderboard API.
 * Gated by BARQ_LEADERBOARD_LIVE (default off). When off returns demo rows + live:false.
 */
export const Route = createFileRoute("/api/leaderboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const limit = Number(url.searchParams.get("limit") ?? 10) || 10;
        const payload = await leaderboardPayload(limit);
        return Response.json(payload, {
          status: 200,
          headers: {
            "cache-control": "no-store",
            "x-barq-leaderboard-live": payload.live ? "1" : "0",
          },
        });
      },
    },
  },
});
