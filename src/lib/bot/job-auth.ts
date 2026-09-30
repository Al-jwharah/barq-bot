import { jobSecret } from "./config.server";
import { secretsMatch } from "./webhook-guard";

/**
 * Authorize ops/queue routes that drain jobs or expose internal stats.
 * Accepts (any one):
 * - header `x-barq-job`
 * - query `?secret=`
 * - JSON body `.secret` (pass as bodySecret)
 * - `Authorization: Bearer <secret>` (Vercel cron Bearer: CRON_SECRET and/or BARQ_JOB_SECRET)
 * Never log got/want values.
 */
export function authorizeJobRequest(request: Request, bodySecret?: string): boolean {
  const want = jobSecret();
  // Vercel cron sends Authorization: Bearer $CRON_SECRET.
  // Accept BARQ_JOB_SECRET (header/query/body/Bearer) and, for Bearer only,
  // CRON_SECRET when set (may equal BARQ_JOB_SECRET). Never log values.
  const cron =
    (typeof process !== "undefined" ? process.env.CRON_SECRET?.trim() : "") || "";

  if (want) {
    const hdr = request.headers.get("x-barq-job") ?? "";
    if (secretsMatch(hdr, want)) return true;

    const q = new URL(request.url).searchParams.get("secret") ?? "";
    if (secretsMatch(q, want)) return true;

    if (bodySecret != null && bodySecret !== "" && secretsMatch(String(bodySecret), want)) {
      return true;
    }
  }

  const auth = request.headers.get("authorization") ?? "";
  const bm = /^Bearer\s+(\S+)/i.exec(auth.trim());
  if (bm?.[1]) {
    if (want && secretsMatch(bm[1], want)) return true;
    if (cron && secretsMatch(bm[1], cron)) return true;
  }

  return false;
}

/** Legacy `/api/keep?probe=<jobSecret>` treated as authenticated probe mode. */
export function legacyKeepProbeSecret(request: Request): boolean {
  const probe = new URL(request.url).searchParams.get("probe") ?? "";
  const want = jobSecret();
  return Boolean(probe) && secretsMatch(probe, want);
}
