import { createFileRoute } from "@tanstack/react-router";
import { jobSecret } from "@/lib/bot/config.server";
import { drainJobs, processDownloadJob } from "@/lib/jobs/worker.server";
import { jobStats } from "@/lib/jobs/queue.server";
import { flushDb } from "@/lib/db";

function authorized(request: Request, bodySecret?: string): boolean {
  const hdr = request.headers.get("x-barq-job") ?? "";
  const q = new URL(request.url).searchParams.get("secret") ?? "";
  const want = jobSecret();
  return Boolean(want) && (hdr === want || q === want || bodySecret === want);
}

export const Route = createFileRoute("/api/jobs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const stats = await jobStats().catch(() => null);
        if (!authorized(request)) return Response.json({ ok: true, queue: stats });
        const drained = await drainJobs(5);
        await flushDb().catch(() => undefined);
        return Response.json({ ok: true, queue: stats, drained });
      },
      POST: async ({ request }) => {
        let body: { id?: string; secret?: string } = {};
        try {
          body = (await request.json()) as { id?: string; secret?: string };
        } catch {
          body = {};
        }
        if (!authorized(request, body.secret)) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const result = body.id ? await processDownloadJob(body.id) : await drainJobs(5);
        await flushDb().catch(() => undefined);
        return Response.json({ ok: true, result });
      },
    },
  },
});
