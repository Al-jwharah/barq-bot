import { createFileRoute } from "@tanstack/react-router";
import { leaderboardPayload } from "@/lib/bot/leaderboard.server";

/**
 * Optional weekly leaderboard API.
 * Gated by BARQ_LEADERBOARD_LIVE (default off). Returns live:false until enabled.
 */
export const Route = createFileRoute("/api/leaderboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const limit = Number(url.searchParams.get("limit") ?? 10) || 10;
        const payload = await leaderboardPayload(limit);
        const status = payload.live ? 200 : 503;
        return Response.json(payload, {
          status,
          headers: {
            "cache-control": "no-store",
            "x-barq-leaderboard-live": payload.live ? "1" : "0",
          },
        });
      },
    },
  },
});
