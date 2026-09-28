import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { TELEGRAM_BOT_TOKEN } from "./config.server";
import { lastClip, setLastClip, type LastClip } from "./session.server";

const MAX_CLIP_SEC = 180;
const MAX_BYTES = 48 * 1024 * 1024;

export function clockToSec(raw: string): number | null {
  const bits = raw.trim().split(":").map((n) => Number(n));
  if (!bits.length || bits.some((n) => !Number.isInteger(n) || n < 0)) return null;
  if (bits.length === 1) return bits[0]!;
  if (bits.length === 2) {
    if (bits[1]! > 59) return null;
    return bits[0]! * 60 + bits[1]!;
  }
  if (bits.length === 3) {
    if (bits[1]! > 59 || bits[2]! > 59) return null;
    return bits[0]! * 3600 + bits[1]! * 60 + bits[2]!;
  }
  return null;
}

export function parseClipRange(text: string): { start: number; end: number } | null {
  const m = text.trim().match(/^(\d{1,2}(?::\d{2}){0,2})\s*[-–—]\s*(\d{1,2}(?::\d{2}){0,2})$/);
  if (!m) return null;
  const start = clockToSec(m[1]!);
  const end = clockToSec(m[2]!);
  if (start == null || end == null) return null;
  if (end <= start) return null;
  if (end - start > MAX_CLIP_SEC) return null;
  if (end - start < 1) return null;
  return { start, end };
}

export function publishDraft(clip?: LastClip | null): string {
  const title = (clip?.title || "مقطع").replace(/\s+/g, " ").trim().slice(0, 80);
  const link = clip?.url ? `\n${clip.url}` : "";
  return `مسودة — راجعها قبل النشر\n\n${title}${link}\n\nالنص مقترح من بيانات الرابط فقط. التحميل لا يمنح حق إعادة النشر.`;
}

async function ensureSaves() {
  const sql = await getSql();
  await sql`
    create table if not exists user_saves (
      id text primary key,
      tg_id text not null,
      title text,
      source_url text,
      file_id text,
      kind text not null default 'video',
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists user_saves_tg_idx on user_saves (tg_id, created_at desc)`;
}

export async function saveCurrentClip(tgId: number): Promise<{ ok: boolean; message: string; id?: string }> {
  const clip = lastClip(tgId);
  if (!clip?.url && !clip?.fileId) return { ok: false, message: "حمّل مقطعًا أولًا ثم اضغط احفظ." };
  const sql = await getSql();
  await ensureSaves();
  const id = randomBytes(4).toString("hex");
  await sql`
    insert into user_saves (id, tg_id, title, source_url, file_id, kind)
    values (
      ${id},
      ${String(tgId)},
      ${(clip.title || "مقطع").slice(0, 120)},
      ${(clip.url || "").slice(0, 500)},
      ${clip.fileId ?? null},
      ${clip.kind || "video"}
    )
  `;
  return { ok: true, message: "انحفظ في محفوظاتك.", id };
}

export async function listSaves(tgId: number): Promise<{ id: string; title: string }[]> {
  const sql = await getSql();
  await ensureSaves();
  const rows = await sql<{ id: string; title: string | null }>`
    select id, title from user_saves
    where tg_id = ${String(tgId)}
    order by created_at desc
    limit 8
  `;
  return rows.map((r) => ({ id: r.id, title: r.title || "مقطع" }));
}

export async function savedFile(tgId: number, id: string): Promise<{ fileId: string; kind: string; title: string } | null> {
  const sql = await getSql();
  await ensureSaves();
  const rows = await sql<{ file_id: string | null; kind: string; title: string | null }>`
    select file_id, kind, title from user_saves
    where id = ${id} and tg_id = ${String(tgId)}
    limit 1
  `;
  const row = rows[0];
  if (!row?.file_id) return null;
  return { fileId: row.file_id, kind: row.kind || "video", title: row.title || "مقطع" };
}

export async function deleteSave(tgId: number, id: string): Promise<boolean> {
  const sql = await getSql();
  await ensureSaves();
  const rows = await sql<{ id: string }>`
    delete from user_saves where id = ${id} and tg_id = ${String(tgId)} returning id
  `;
  return Boolean(rows[0]);
}

export function rememberDeliveredFile(tgId: number, fileId: string) {
  const cur = lastClip(tgId);
  if (!fileId) return;
  if (cur) setLastClip(tgId, { ...cur, fileId });
  else setLastClip(tgId, { url: "", fileId, kind: "video" });
}

async function downloadClipSource(clip: LastClip): Promise<Buffer> {
  if (clip.fileId && TELEGRAM_BOT_TOKEN) {
    const info = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(clip.fileId)}`);
    const json = (await info.json()) as { ok?: boolean; result?: { file_path?: string; file_size?: number } };
    const path = json.result?.file_path;
    const size = json.result?.file_size ?? 0;
    if (path && size > 0 && size <= MAX_BYTES) {
      const file = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${path}`);
      if (file.ok) return Buffer.from(await file.arrayBuffer());
    }
  }
  const url = clip.mediaUrl || clip.url;
  if (!url || !/^https?:\/\//i.test(url)) throw new Error("ما قدرت أرجع لملف المقطع. أعد التحميل ثم القص.");
  const res = await fetch(url);
  if (!res.ok) throw new Error("تعذر قراءة الملف للقص.");
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new Error("المقطع أكبر من حد القص داخل تليجرام.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("المقطع أكبر من حد القص داخل تليجرام.");
  return buf;
}

export async function clipLastVideo(tgId: number, rangeText: string): Promise<Blob> {
  const range = parseClipRange(rangeText);
  if (!range) throw new Error("اكتب المدى هكذا: 00:12-00:35 وأقصاه 3 دقائق.");
  const clip = lastClip(tgId);
  if (!clip || (clip.kind && clip.kind !== "video" && clip.kind !== "gif")) {
    throw new Error("القص للفيديو فقط. حمّل مقطعًا ثم اضغط قصّ.");
  }
  const bytes = await downloadClipSource(clip);
  const { clipBuffer } = await import("../media/convert.server");
  return clipBuffer(bytes, range.start, range.end);
}
