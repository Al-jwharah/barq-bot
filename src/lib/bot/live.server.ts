import { getSql } from "@/lib/db";
import { looksLikeLiveStream } from "./product.server";
import { telegram } from "./telegram.server";

async function ensure() {
  const sql = await getSql();
  await sql`
    create table if not exists live_follows (
      tg_id text not null,
      handle text not null,
      url text not null,
      last_live boolean not null default false,
      last_check timestamptz not null default now(),
      primary key (tg_id, handle)
    )
  `;
}

export function parseLiveTarget(text: string): { handle: string; url: string } | null {
  const raw = text.replace(/^\/live(?:@\w+)?\s*/i, "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const handle = (u.pathname.split("/").filter(Boolean)[0] || u.hostname).replace(/^@/, "");
      return { handle: handle.slice(0, 40), url: raw };
    } catch {
      return null;
    }
  }
  const handle = raw.replace(/^@/, "").trim();
  if (/\s/.test(handle)) return null;
  if (!/^[A-Za-z0-9_.]{2,32}$/.test(handle)) return null;
  return { handle, url: `https://www.twitch.tv/${handle}` };
}

export function liveHelp(): string {
  return `مسجّل البث ⚡️
/live @username
أو /live مع رابط تويتش/يوتيوب لايف

ننبّهك عند البث. التسجيل المستمر لساعات غير متاح على السيرفر الحالي — بعد انتهاء البث نحاول حفظ الفود إن وُجد.`;
}

export async function followLive(tgId: number, target: { handle: string; url: string }): Promise<string> {
  await ensure();
  const sql = await getSql();
  const live = looksLikeLiveStream(target.url);
  await sql`
    insert into live_follows (tg_id, handle, url, last_live)
    values (${String(tgId)}, ${target.handle.toLowerCase()}, ${target.url}, ${live})
    on conflict (tg_id, handle) do update set url = excluded.url, last_check = now()
  `;
  return live
    ? `🔴 ${target.handle} يبدو أنه على الهواء.\nنراسلك عند التغيّر.`
    : `تابعنا ${target.handle}. إذا بدأ بثاً نرسل لك تنبيهاً.`;
}

export async function listFollows(tgId: number): Promise<string> {
  await ensure();
  const sql = await getSql();
  const rows = await sql<{ handle: string; last_live: boolean }>`
    select handle, last_live from live_follows where tg_id = ${String(tgId)} order by last_check desc limit 12
  `;
  if (!rows.length) return "ما تتابع أحد. /live @username";
  return rows.map((r) => `${r.last_live ? "🔴" : "○"} ${r.handle}`).join("\n");
}

export async function pollLiveFollows(): Promise<number> {
  await ensure();
  const sql = await getSql();
  const rows = await sql<{ tg_id: string; handle: string; url: string; last_live: boolean }>`
    select tg_id, handle, url, last_live from live_follows
    where last_check < now() - interval '8 minutes'
    order by last_check asc
    limit 15
  `;
  let sent = 0;
  for (const row of rows) {
    const nowLive = looksLikeLiveStream(row.url);
    await sql`
      update live_follows set last_live = ${nowLive}, last_check = now()
      where tg_id = ${row.tg_id} and handle = ${row.handle}
    `;
    if (nowLive && !row.last_live) {
      await telegram
        .sendMessage(Number(row.tg_id), `🔴 ${row.handle} بدأ بث مباشر\n${row.url}`)
        .catch(() => undefined);
      sent += 1;
    }
  }
  return sent;
}
