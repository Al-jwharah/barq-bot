export type AwaitKind =
  | "code"
  | "broadcast"
  | "newcode"
  | "cancelcode"
  | "grant"
  | "editsub"
  | "channel"
  | "free_n"
  | "ads_text"
  | "news_post"
  | "contest_post"
  | "gift"
  | "feedback"
  | "hostfile"
  | "lib_search"
  | "stickercut";

const HOSTFILE_TTL_MS = 90_000;
const g = globalThis as unknown as {
  __barqAwait?: Map<number, AwaitKind>;
  __barqAwaitAt?: Map<number, number>;
  __barqBusy?: Set<number>;
  __barqHeroId?: string;
  __barqGrokMode?: Set<number>;
  __barqOwnerMedia?: { chatId: number; messageId: number; kind: string };
  __barqLastClip?: Map<number, { url: string; title?: string; platform?: string }>;
};

export function awaitMap(): Map<number, AwaitKind> {
  if (!g.__barqAwait) g.__barqAwait = new Map();
  return g.__barqAwait;
}

function awaitAt(): Map<number, number> {
  if (!g.__barqAwaitAt) g.__barqAwaitAt = new Map();
  return g.__barqAwaitAt;
}

export function setAwait(id: number, kind: AwaitKind) {
  awaitMap().set(id, kind);
  awaitAt().set(id, Date.now());
}

export function clearAwait(id: number) {
  awaitMap().delete(id);
  awaitAt().delete(id);
}

export function peekAwait(id: number): AwaitKind | undefined {
  const kind = awaitMap().get(id);
  if (!kind) return undefined;
  const at = awaitAt().get(id) ?? 0;
  if (kind === "hostfile" && Date.now() - at > HOSTFILE_TTL_MS) {
    clearAwait(id);
    return undefined;
  }
  return kind;
}

export function busySet(): Set<number> {
  if (!g.__barqBusy) g.__barqBusy = new Set();
  return g.__barqBusy;
}

export function heroFileId(): string | undefined {
  return g.__barqHeroId;
}

export function setHeroFileId(id: string | undefined) {
  g.__barqHeroId = id;
}

function grokModeSet(): Set<number> {
  if (!g.__barqGrokMode) g.__barqGrokMode = new Set();
  return g.__barqGrokMode;
}

export function inGrokMode(id: number): boolean {
  return grokModeSet().has(id);
}

export function setGrokMode(id: number, on: boolean) {
  if (on) grokModeSet().add(id);
  else grokModeSet().delete(id);
}

export function lastOwnerMedia(): { chatId: number; messageId: number; kind: string } | undefined {
  return g.__barqOwnerMedia;
}

export function setLastOwnerMedia(chatId: number, messageId: number, kind: string) {
  g.__barqOwnerMedia = { chatId, messageId, kind };
}

export type LastClip = {
  url: string;
  title?: string;
  platform?: string;
  mediaUrl?: string;
  thumbnail?: string;
  kind?: string;
};

function lastClipMap(): Map<number, LastClip> {
  if (!g.__barqLastClip) g.__barqLastClip = new Map();
  return g.__barqLastClip;
}

export function setLastClip(id: number, clip: LastClip) {
  lastClipMap().set(id, clip);
}

export function lastClip(id: number): LastClip | undefined {
  return lastClipMap().get(id);
}