import { createFileRoute } from "@tanstack/react-router";
import { isClipId } from "@/lib/bot/clip-id";
import { clipNotFoundResponse, serveClipById } from "@/lib/bot/clip-serve.server";

export const Route = createFileRoute("/d/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const fromParams = typeof params.id === "string" ? params.id : "";
        const fromPath = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
        const id = fromParams || fromPath;
        if (!isClipId(id)) return clipNotFoundResponse();
        return serveClipById(id, request);
      },
    },
  },
});
