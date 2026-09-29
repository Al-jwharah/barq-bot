export const DROP_HOURS = [12, 24] as const;
export type DropHours = (typeof DROP_HOURS)[number];

export type DropFile = {
  fileId: string;
  kind: "video" | "photo" | "file" | "app";
  fileName?: string;
  mime?: string;
};

const HOLD_MS = 5 * 60 * 1000;

type Stash = DropFile & { at: number };

function dropMap(): Map<number, Stash> {
  const g = globalThis as unknown as { __barqDrop?: Map<number, Stash> };
  if (!g.__barqDrop) g.__barqDrop = new Map();
  return g.__barqDrop;
}

export function stashDrop(tgId: number, file: DropFile): void {
  dropMap().set(tgId, { ...file, at: Date.now() });
}

export function peekDrop(tgId: number): DropFile | null {
  const row = dropMap().get(tgId);
  if (!row) return null;
  if (Date.now() - row.at > HOLD_MS) {
    dropMap().delete(tgId);
    return null;
  }
  return { fileId: row.fileId, kind: row.kind, fileName: row.fileName, mime: row.mime };
}

export function takeDrop(tgId: number): DropFile | null {
  const row = peekDrop(tgId);
  dropMap().delete(tgId);
  return row;
}

export function clearDrop(tgId: number): void {
  dropMap().delete(tgId);
}

export function parseDropHours(raw: string): DropHours | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (t === "12" || t === "12h" || t === "12س" || t === "12ساعة" || t === "١٢") return 12;
  if (t === "24" || t === "24h" || t === "24س" || t === "24ساعة" || t === "٢٤") return 24;
  return null;
}

export function dropTtlMs(hours: DropHours): number {
  return hours * 60 * 60 * 1000;
}

export function dropKindLabel(kind: string): string {
  if (kind === "photo") return "صورة";
  if (kind === "video") return "فيديو";
  if (kind === "app") return "تطبيق";
  return "ملف";
}

export const DROP_ENTER = `🔗 رابط مؤقت
مسار مستقل عن التحميل.

أرسل الملف الآن: صورة، فيديو، صوت، أو مستند.
بعدها تختار 12 ساعة أو 24 ساعة.
حد الملف 20 ميغا.`;

export function dropPickText(kind: string): string {
  return `${dropKindLabel(kind)} وصل.\nكم يبقى الرابط؟`;
}

export function dropReadyText(hours: DropHours, url: string): string {
  return `🔗 الرابط جاهز لمدة ${hours} ساعة.\nيفتح الملف ثم يختفي.\n\n${url}`;
}
