import { logJson } from "./observability.server";

export async function captureError(err: unknown, ctx = "app"): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await logJson({ event: "error", status: "error", errorCode: ctx.slice(0, 80) }).catch(() => undefined);
  const dsn = typeof process !== "undefined" ? process.env.SENTRY_DSN?.trim() : "";
  if (!dsn) return;
  try {
    const url = new URL(dsn.replace(/^https:\/\/([^@]+)@/, "https://"));
    // DSN present: structured log only unless Sentry SDK is added later.
    await logJson({ event: "sentry_queued", status: "ok", errorCode: url.host.slice(0, 40) });
    void message;
  } catch {
    /* ignore */
  }
}
