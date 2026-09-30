import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { authorizeJobRequest } from "../lib/bot/job-auth";
import type { WorkerLoop, WorkerLoopStats } from "./loop";
import { workerPort } from "./flags";

function readJson(req: IncomingMessage): Promise<{ id?: string; secret?: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 64_000) {
        resolve({});
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw) as { id?: string; secret?: string });
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function toRequest(req: IncomingMessage, bodySecret?: string): Request {
  const host = req.headers.host ?? "localhost";
  const url = `http://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(","));
  }
  return new Request(url, { method: req.method, headers });
}

export type WorkerHttpOpts = {
  loop: WorkerLoop;
  /** Optional: process a specific job id from wake body (full path, not dry). */
  processJob?: (id: string) => Promise<{ id?: string; status: string }>;
  getStats?: () => WorkerLoopStats;
  port?: number;
};

/**
 * Minimal health + wake HTTP surface for Fly/Railway.
 * GET /healthz — liveness (no secrets)
 * POST /wake — auth with BARQ_JOB_SECRET; nudges drain loop
 */
export function startWorkerHttp(opts: WorkerHttpOpts): Server {
  const port = opts.port ?? workerPort();
  const server = createServer(async (req, res) => {
    try {
      await handle(req, res, opts);
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
    }
  });
  server.listen(port, "0.0.0.0");
  return server;
}

async function handle(req: IncomingMessage, res: ServerResponse, opts: WorkerHttpOpts) {
  const path = (req.url ?? "/").split("?")[0] ?? "/";
  const method = (req.method ?? "GET").toUpperCase();

  if (method === "GET" && (path === "/healthz" || path === "/health" || path === "/")) {
    const stats = opts.getStats?.() ?? opts.loop.stats;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "barq-worker",
        running: stats.running,
        shuttingDown: stats.shuttingDown,
        drains: stats.drains,
        claimed: stats.claimed,
        emptyPolls: stats.emptyPolls,
        errors: stats.errors,
        lastDrainAt: stats.lastDrainAt,
      }),
    );
    return;
  }

  if (method === "POST" && path === "/wake") {
    const body = await readJson(req);
    const request = toRequest(req);
    if (!authorizeJobRequest(request, body.secret)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    opts.loop.nudge();
    let result: { id?: string; status: string } | undefined;
    if (body.id && opts.processJob) {
      result = await opts.processJob(body.id).catch((err) => ({
        status: "error",
        error: err instanceof Error ? err.message.slice(0, 80) : "wake",
      })) as { id?: string; status: string };
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, nudged: true, result }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not_found" }));
}
