import { Jimp } from "jimp";
import { TELEGRAM_BOT_TOKEN } from "./config.server";
import { publicUrl } from "./origin";
import { getSettings, setSetting } from "./store.server";
import { sendPhotoFile, telegram, type TgMessage } from "./telegram.server";
import { flushDb } from "@/lib/db";

function guessGrid(w: number, h: number): { cols: number; rows: number } {
  const ratio = w / h;
  const options = [
    [4, 4],
    [3, 3],
    [5, 4],
    [4, 5],
    [3, 4],
    [4, 3],
    [2, 2],
    [5, 5],
  ];
  let best = [4, 4] as [number, number];
  let bestDiff = 99;
  for (const [c, r] of options) {
    const diff = Math.abs(ratio - c! / r!);
    if (diff < bestDiff) {
      best = [c!, r!];
      bestDiff = diff;
    }
  }
  return { cols: best[0], rows: best[1] };
}

async function loadSheet(msg: TgMessage): Promise<Buffer> {
  const fileId =
    msg.document?.file_id ||
    (msg.photo?.length ? msg.photo[msg.photo.length - 1]!.file_id : undefined);
  if (!fileId) throw new Error("أرسل صورة الشبكة");
  const file = await telegram.getFile(fileId);
  if (!file.file_path) throw new Error("تعذر قراءة الصورة");
  const res = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`);
  if (!res.ok) throw new Error("تعذر تنزيل الصورة");
  return Buffer.from(await res.arrayBuffer());
}

export async function cutStickerSheet(chatId: number, msg: TgMessage): Promise<number> {
  const raw = await loadSheet(msg);
  const img = await Jimp.read(raw);
  const { cols, rows } = guessGrid(img.width, img.height);
  const cellW = img.width / cols;
  const cellH = img.height / rows;
  const padX = cellW * 0.05;
  const padY = cellH * 0.05;
  const urls: string[] = [];
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  await telegram.sendMessage(chatId, `أقصّ الشبكة ${cols}×${rows}…`);

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = Math.round(c * cellW + padX);
      const y = Math.round(r * cellH + padY);
      const w = Math.max(8, Math.round(cellW - padX * 2));
      const h = Math.max(8, Math.round(cellH - padY * 2));
      const piece = img.clone().crop({ x, y, w, h });
      try {
        piece.autocrop({ cropOnlyFrames: false, tolerance: 0.0002 });
      } catch {
        /* keep cell */
      }
      piece.contain({ w: 512, h: 512 });
      const png = await piece.getBuffer("image/png");
      const blob = new Blob([new Uint8Array(png)], { type: "image/png" });
      const name = `barq-${r + 1}x${c + 1}.png`;
      if (token) {
        try {
          const { put } = await import("@vercel/blob");
          const stored = await put(`stickers/${Date.now()}-${name}`, blob, {
            access: "public",
            token,
            contentType: "image/png",
          });
          urls.push(stored.url);
          await telegram.sendPhotoUrl(chatId, stored.url, { caption: name });
          continue;
        } catch {
          /* send file */
        }
      }
      await sendPhotoFile(chatId, blob, name, { caption: name });
    }
  }

  if (urls.length) {
    const prev = await getSettings().catch(() => ({}) as Record<string, string>);
    let pack: string[] = [];
    try {
      pack = JSON.parse(prev.sticker_pack || "[]") as string[];
    } catch {
      pack = [];
    }
    pack = [...pack, ...urls].slice(-80);
    await setSetting("sticker_pack", JSON.stringify(pack));
    await flushDb().catch(() => undefined);
  }
  return cols * rows;
}

export const STICKER_COUNT = 76;
export const GIF_FILES = ["barq-dance.mp4", "barq-cat.mp4", "barq-chicken.mp4", "barq-bolt.mp4"] as const;

export function stickerUrl(n: number): string {
  return publicUrl(`/stickers/barq-${String(n).padStart(2, "0")}.jpg`);
}

export function randomStickerUrl(): string {
  return stickerUrl(1 + Math.floor(Math.random() * STICKER_COUNT));
}

export function randomGifUrl(): string {
  const f = GIF_FILES[Math.floor(Math.random() * GIF_FILES.length)]!;
  return publicUrl(`/gifs/${f}`);
}

export async function sendBuiltinStickers(chatId: number) {
  const urls = Array.from({ length: Math.min(20, STICKER_COUNT) }, (_, i) => stickerUrl(i + 1));
  for (let i = 0; i < urls.length; i += 10) {
    const chunk = urls.slice(i, i + 10).map((media) => ({ type: "photo" as const, media }));
    await telegram.sendMediaGroup(chatId, chunk);
  }
  const gifs = GIF_FILES.map((f) => ({ type: "video" as const, media: publicUrl(`/gifs/${f}`) }));
  await telegram.sendMediaGroup(chatId, gifs).catch(() => undefined);
  return STICKER_COUNT;
}

export async function sendRandomSticker(chatId: number) {
  try {
    await telegram.sendPhotoUrl(chatId, randomStickerUrl());
  } catch {
    await telegram.sendAnimationUrl(chatId, randomGifUrl()).catch(() => undefined);
  }
}

export async function savedStickerUrls(): Promise<string[]> {
  const s = await getSettings().catch(() => ({}) as Record<string, string>);
  try {
    const pack = JSON.parse(s.sticker_pack || "[]") as string[];
    return pack.filter((u) => typeof u === "string");
  } catch {
    return [];
  }
}
