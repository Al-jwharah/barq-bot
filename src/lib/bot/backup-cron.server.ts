import { getSettings, setSetting, backupSnapshot } from "./store.server";
import { logEvent, logJson } from "./observability.server";

export async function runDailyBackup(): Promise<boolean> {
  const last = Number((await getSettings())["backup_at"] ?? 0);
  if (last && Date.now() - last < 20 * 60 * 60_000) return false;
  await setSetting("backup_at", String(Date.now()));
  const snap = await backupSnapshot();
  const token = typeof process !== "undefined" ? process.env.BLOB_READ_WRITE_TOKEN?.trim() : "";
  if (token) {
    const { put } = await import("@vercel/blob");
    const body = JSON.stringify({ at: snap.at, members: snap.members.length, codes: snap.codes.length });
    await put(`backups/barq-${new Date().toISOString().slice(0, 10)}.json`, body, {
      access: "private",
      token,
      addRandomSuffix: true,
    }).catch(() => undefined);
  }
  await logEvent({
    action: "backup_daily",
    status: "ok",
    detail: `members=${snap.members.length} codes=${snap.codes.length}`,
  }).catch(() => undefined);
  await logJson({ event: "backup_daily", status: "ok" }).catch(() => undefined);
  return true;
}
