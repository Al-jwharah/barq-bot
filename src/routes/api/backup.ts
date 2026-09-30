import { createFileRoute } from "@tanstack/react-router";
import { requireWeb } from "@/lib/bot/acl.server";
import { hasAdminSession } from "@/lib/bot/admin-session.server";
import { logEvent, logJson } from "@/lib/bot/observability.server";
import { backupSnapshot, restoreBackup, restoreTest } from "@/lib/bot/store.server";

function countDetail(parts: Record<string, number>): string {
  return Object.entries(parts)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

export const Route = createFileRoute("/api/backup")({
  server: {
    handlers: {
      GET: async () => {
        try {
          await requireWeb("owners.manage");
        } catch {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        await logEvent({ action: "backup_started", status: "ok", detail: "dump" });
        await logJson({ event: "backup_started", status: "ok" });
        try {
          const snap = await backupSnapshot();
          const detail = countDetail({
            members: snap.members.length,
            codes: snap.codes.length,
            settings: Object.keys(snap.settings).length,
            usage: snap.usage.length,
            bans: snap.bans.length,
            tickets: snap.tickets.length,
            clips: snap.clips.length,
            jobs: snap.jobs.length,
          });
          await logEvent({ action: "backup_completed", status: "ok", detail: `dump ${detail}` });
          await logJson({ event: "backup_completed", status: "ok" });
          return Response.json(snap);
        } catch {
          await logEvent({ action: "backup_completed", status: "error", detail: "dump failed" });
          await logJson({ event: "backup_completed", status: "error", errorCode: "backup_failed" });
          return Response.json({ error: "backup_failed" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        if (!(await hasAdminSession())) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        let body: { confirm?: unknown; snapshot?: unknown } = {};
        try {
          body = (await request.json()) as { confirm?: unknown; snapshot?: unknown };
        } catch {
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }
        const confirm = typeof body.confirm === "string" ? body.confirm : "";
        if (confirm !== "RESTORE" && confirm !== "TEST") {
          return Response.json({ error: "confirm_required" }, { status: 400 });
        }
        if (body.snapshot == null) {
          return Response.json({ error: "snapshot_required" }, { status: 400 });
        }

        const tested = await restoreTest(body.snapshot);
        if (!tested.ok) {
          await logJson({ event: "restore_test_completed", status: "error", errorCode: "invalid_snapshot" });
          return Response.json({ error: "invalid_snapshot", applied: false as const, errors: tested.errors }, { status: 400 });
        }
        if (confirm === "TEST") {
          await logJson({ event: "restore_test_completed", status: "ok" });
          return Response.json({
            ok: true,
            applied: false,
            settings: tested.settings,
            codes: tested.codes,
            members: tested.members,
            usage: tested.usage,
            bans: tested.bans,
            tickets: tested.tickets,
            clips: tested.clips,
            jobs: tested.jobs,
          });
        }

        await logEvent({ action: "backup_started", status: "ok", detail: "restore" });
        await logJson({ event: "backup_started", status: "ok" });
        try {
          const snap = body.snapshot as Parameters<typeof restoreBackup>[0];
          const result = await restoreBackup(snap);
          await logEvent({
            action: "backup_completed",
            status: "ok",
            detail: `restore ${countDetail({
              members: result.members,
              usage: result.usage,
              codes: result.codes,
              bans: result.bans,
              tickets: result.tickets,
              clips: result.clips,
              jobs: result.jobs,
            })}`,
          });
          await logJson({ event: "backup_completed", status: "ok" });
          return Response.json({
            ok: true,
            applied: true,
            members: result.members,
            usage: result.usage,
            codes: result.codes,
            bans: result.bans,
            tickets: result.tickets,
            clips: result.clips,
            jobs: result.jobs,
          });
        } catch {
          await logEvent({ action: "backup_completed", status: "error", detail: "restore failed" });
          await logJson({ event: "backup_completed", status: "error", errorCode: "restore_failed" });
          return Response.json({ error: "restore_failed" }, { status: 500 });
        }
      },
    },
  },
});
