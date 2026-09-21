const KEY = "barq-promo-codes.json";

export type BlobPromo = {
  code: string;
  days: number;
  max_uses: number;
  used_count: number;
  active: boolean;
};

function blobToken(): string {
  return (typeof process !== "undefined" && process.env.BLOB_READ_WRITE_TOKEN?.trim()) || "";
}

export async function loadPromoBlob(): Promise<BlobPromo[]> {
  const token = blobToken();
  if (!token) return [];
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: "barq-promo", token, limit: 8 });
    const hit = blobs.find((b) => b.pathname === KEY) ?? blobs.find((b) => b.pathname.startsWith("barq-promo-codes"));
    if (!hit) return [];
    const res = await fetch(hit.url);
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as BlobPromo[]) : [];
  } catch {
    return [];
  }
}

export async function savePromoBlob(codes: BlobPromo[]): Promise<void> {
  const token = blobToken();
  if (!token) return;
  const { put } = await import("@vercel/blob");
  await put(KEY, JSON.stringify(codes), {
    access: "private",
    token,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

export async function putPromo(row: BlobPromo): Promise<void> {
  const all = await loadPromoBlob();
  const i = all.findIndex((x) => x.code === row.code);
  if (i >= 0) all[i] = { ...all[i], ...row };
  else all.unshift(row);
  await savePromoBlob(all);
}

export async function findPromo(code: string): Promise<BlobPromo | undefined> {
  const all = await loadPromoBlob();
  return all.find((x) => x.code === code);
}

export async function consumePromo(code: string): Promise<BlobPromo | null> {
  const all = await loadPromoBlob();
  const i = all.findIndex((x) => x.code === code);
  if (i < 0) return null;
  const row = all[i]!;
  if (!row.active) return null;
  if (Number(row.used_count) >= Number(row.max_uses)) return null;
  row.used_count = Number(row.used_count) + 1;
  all[i] = row;
  await savePromoBlob(all);
  return row;
}
