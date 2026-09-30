import { randomBytes } from "node:crypto";
import { logJson, redactSecrets } from "./observability.server";

type ParsedDsn = {
  publicKey: string;
  host: string;
  projectId: string;
};

let cachedDsn: ParsedDsn | null | undefined;
let initLogged = false;

/** Parse a Sentry DSN. Returns null when missing/invalid. Exported for unit tests. */
export function parseSentryDsn(dsn: string): ParsedDsn | null {
  const trimmed = dsn.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const publicKey = decodeURIComponent(u.username || "");
    const projectId = u.pathname.replace(/^\//, "").split("/")[0] ?? "";
    if (!publicKey || !projectId || !u.host) return null;
    return { publicKey, host: u.host, projectId };
  } catch {
    return null;
  }
}

function resolveDsn(): ParsedDsn | null {
  if (cachedDsn !== undefined) return cachedDsn;
  const raw = typeof process !== "undefined" ? process.env.SENTRY_DSN?.trim() : "";
  cachedDsn = raw ? parseSentryDsn(raw) : null;
  return cachedDsn;
}

/** Test helper — clear memoized DSN between cases. */
export function resetSentryForTests(): void {
  cachedDsn = undefined;
  initLogged = false;
}

export function sentryEnabled(): boolean {
  return resolveDsn() != null;
}

/**
 * Idempotent init for server/API entry points.
 * No-op when SENTRY_DSN is unset; never invents a DSN.
 */
export function initSentry(): boolean {
  const d = resolveDsn();
  if (!d) {
    if (!initLogged) {
      initLogged = true;
      void logJson({ event: "sentry_disabled", status: "ok" }).catch(() => undefined);
    }
    return false;
  }
  if (!initLogged) {
    initLogged = true;
    void logJson({ event: "sentry_ready", status: "ok", errorCode: d.host.slice(0, 40) }).catch(() => undefined);
  }
  return true;
}

function eventId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Capture an error to structured logs and, when SENTRY_DSN is set, to Sentry store API.
 * Never throws. Safe to call from request handlers and workers.
 */
export async function captureError(err: unknown, ctx = "app"): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const safeMessage = redactSecrets(message).slice(0, 500);
  const safeCtx = redactSecrets(ctx).slice(0, 80);
  await logJson({ event: "error", status: "error", errorCode: safeCtx }).catch(() => undefined);

  const d = resolveDsn();
  if (!d) return;
  initSentry();

  try {
    const stack = err instanceof Error ? err.stack : undefined;
    const frames =
      stack
        ?.split("\n")
        .slice(1, 12)
        .map((line) => ({ filename: "app", function: redactSecrets(line.trim()).slice(0, 200) })) ?? [];

    const payload = {
      event_id: eventId(),
      timestamp: Date.now() / 1000,
      platform: "node",
      level: "error",
      server_name: "barq-bot",
      tags: { ctx: safeCtx },
      exception: {
        values: [
          {
            type: err instanceof Error ? err.name.slice(0, 80) : "Error",
            value: safeMessage,
            stacktrace: frames.length ? { frames: frames.reverse() } : undefined,
          },
        ],
      },
    };

    const url = `https://${d.host}/api/${d.projectId}/store/`;
    const auth = `Sentry sentry_version=7, sentry_client=barq-bot/1.0, sentry_key=${d.publicKey}`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": auth,
      },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  } catch {
    /* never throw from capture */
  }
}
