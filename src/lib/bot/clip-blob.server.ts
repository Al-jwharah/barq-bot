const KEY = "barq-clips.json";

export type BlobClip = {
  id: string;
  tg_id: string;
  url: string;
  media_url: string | null;
  thumbnail: string | null;
  kind: string | null;
  platform: string | null;
  created_at: string;
  expires_at: string;
  storage_key?: string | null;
  hits?: number;
  max_hits?: number | null;
};

function blobToken(): string {
  return (typeof process !== "undefined" && process.env.BLOB_READ_WRITE_TOKEN?.trim()) || "";
}

export async function loadClipBlob(): Promise<BlobClip[]> {
  const token = blobToken();
  if (!token) return [];
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: "barq-clips", token, limit: 8 });
    const hit = blobs.find((b) => b.pathname === KEY) ?? blobs[0];
    if (!hit) return [];
    const res = await fetch(hit.url);
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as BlobClip[]) : [];
  } catch {
    return [];
  }
}

export async function putClipBlob(row: BlobClip): Promise<void> {
  const token = blobToken();
  if (!token) return;
  const all = await loadClipBlob();
  const now = Date.now();
  const next = all.filter((c) => Date.parse(c.expires_at) > now && c.id !== row.id);
  next.unshift(row);
  const { put } = await import("@vercel/blob");
  await put(KEY, JSON.stringify(next.slice(0, 400)), {
    access: "private",
    token,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

export async function findClipBlob(id: string): Promise<BlobClip | undefined> {
  const all = await loadClipBlob();
  return all.find((c) => c.id === id);
}
