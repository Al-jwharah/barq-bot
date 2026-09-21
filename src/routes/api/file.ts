import { createFileRoute } from "@tanstack/react-router";
import { serveClipById } from "@/lib/bot/clip-serve.server";

export const Route = createFileRoute("/api/file")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id") ?? "";
        return serveClipById(id, request);
      },
    },
  },
});
