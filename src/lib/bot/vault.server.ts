import {
  BARQ_VAULT_RETENTION_DAYS,
  CHANNEL_CHAT,
  CHANNEL_USERNAME,
  OWNER_TG_ID,
  VAULT_ARCHIVE_ENABLED,
  VAULT_CHAT_ID,
} from "./config.server";
import { getSettings, setSetting } from "./store.server";
import { telegram, type TgMessage } from "./telegram.server";

/** Requester identity for the vault. Captions use Telegram id only; name/username are omit-able. */
export type ArchiveWho = {
  id: number;
  name?: string | null;
  username?: string | null;
};

export const VAULT_RETENTION_DAYS = BARQ_VAULT_RETENTION_DAYS;

export async function vaultChatId(): Promise<string | null> {
  if (VAULT_CHAT_ID) return VAULT_CHAT_ID;
  const s = await getSettings().catch(() => ({}) as Record<string, string>);
  const saved = s.vault_chat_id?.trim();
  return saved || null;
}

export async function rememberVaultChat(chatId: number | string, title?: string) {
  await setSetting("vault_chat_id", String(chatId));
  if (title) await setSetting("vault_title", title);
  try {
    const { flushDb } = await import("../db");
    await flushDb().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

export async function resolveArchiveDest(): Promise<string> {
  return (await vaultChatId()) || CHANNEL_CHAT;
}

export async function probeAndBindVault(): Promise<string | null> {
  const existing = await vaultChatId();
  if (existing) {
    try {
      await telegram.getChat(existing);
      return existing;
    } catch {
      /* stale */
    }
  }
  for (const id of [CHANNEL_CHAT, "@barq_all"]) {
    try {
      const chat = await telegram.getChat(id);
      await rememberVaultChat(chat.id, chat.title);
      return String(chat.id);
    } catch {
      /* next */
    }
  }
  return existing;
}

export async function handleBotMembership(member: {
  chat: { id: number; title?: string; type: string; username?: string };
  new_chat_member?: { status?: string };
}) {
  const chat = member.chat;
  const status = member.new_chat_member?.status ?? "";
  if (chat.type !== "channel" && chat.type !== "supergroup") return;
  if (!["administrator", "creator"].includes(status)) return;
  const { isNewsChannel, rememberNewsChat, flushPendingNews } = await import("./channel.server");
  if (isNewsChannel(chat) || (chat.username || "").toLowerCase() === CHANNEL_USERNAME) {
    await rememberNewsChat(chat.id, chat.title);
    await telegram
      .sendMessage(Number(OWNER_TG_ID), `قناة التحديثات رُبطت ⚡️\n${chat.title ?? "@barq_all"}\n${chat.id}`)
      .catch(() => undefined);
    const posted = await flushPendingNews().catch(() => null);
    if (posted) {
      await telegram.sendMessage(Number(OWNER_TG_ID), `نُشر التحديث المعلّق في @barq_all (رسالة ${posted.messageId}).`).catch(() => undefined);
    }
    return;
  }
  await rememberVaultChat(chat.id, chat.title);
  await telegram
    .sendMessage(
      Number(OWNER_TG_ID),
      `قناة الأرشيف رُبطت ⚡️\n${chat.title ?? "قناة"}\n${chat.id}\nكل تحميل ينزل هنا.`,
    )
    .catch(() => undefined);
  await telegram.sendMessage(chat.id, "التخزين يعمل ⚡️ كل فيديو يتحمل ينسخ هنا.").catch(() => undefined);
}

export async function handleChannelPost(msg: TgMessage) {
  const chat = msg.chat;
  if (chat.type !== "channel" && chat.type !== "supergroup") return;
  const { isNewsChannel, rememberNewsChat } = await import("./channel.server");
  if (isNewsChannel(chat)) {
    await rememberNewsChat(chat.id, chat.title);
    return;
  }
  await rememberVaultChat(chat.id, chat.title);
}

export function forwardedChannel(msg: TgMessage): { id: number; title?: string; username?: string } | null {
  const origin = msg.forward_origin;
  if (origin?.type === "channel" && origin.chat?.id) {
    return { id: origin.chat.id, title: origin.chat.title, username: origin.chat.username };
  }
  if (msg.forward_from_chat?.id && (msg.forward_from_chat.type === "channel" || msg.forward_from_chat.type === "supergroup")) {
    return {
      id: msg.forward_from_chat.id,
      title: msg.forward_from_chat.title,
      username: msg.forward_from_chat.username,
    };
  }
  return null;
}

export async function bindNewsFromForward(msg: TgMessage): Promise<string | null> {
  const chat = forwardedChannel(msg);
  if (!chat) return null;
  const { isNewsChannel, rememberNewsChat, flushPendingNews } = await import("./channel.server");
  if (!isNewsChannel({ username: chat.username, title: chat.title })) return null;
  await rememberNewsChat(chat.id, chat.title);
  const posted = await flushPendingNews().catch(() => null);
  return `${chat.title ?? "@barq_all"} (${chat.id})${posted ? `\nنُشر التحديث المعلّق (رسالة ${posted.messageId})` : ""}`;
}

export async function bindVaultFromForward(msg: TgMessage): Promise<string | null> {
  const chat = forwardedChannel(msg);
  if (!chat) return null;
  const { isNewsChannel } = await import("./channel.server");
  if (isNewsChannel({ username: chat.username, title: chat.title })) return null;
  await rememberVaultChat(chat.id, chat.title);
  await telegram.sendMessage(chat.id, "التخزين يعمل ⚡️ كل فيديو يتحمل ينسخ هنا.").catch(() => undefined);
  return `${chat.title ?? "قناة"} (${chat.id})`;
}

export async function bindVaultFromText(text: string): Promise<string | null> {
  const m = text.match(/-100\d{8,}/);
  if (!m) return null;
  const id = m[0]!;
  try {
    const chat = await telegram.getChat(id);
    await rememberVaultChat(chat.id, chat.title);
    await telegram.sendMessage(chat.id, "التخزين يعمل ⚡️ كل فيديو يتحمل ينسخ هنا.").catch(() => undefined);
    return `${chat.title ?? "قناة"} (${chat.id})`;
  } catch {
    await rememberVaultChat(id);
    return id;
  }
}

/** Caption identity: Telegram id only. name/username are ignored even when provided. */
export function archiveWhoLine(who?: ArchiveWho | null): string {
  const raw = who?.id;
  const id = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(id) || id === 0) return "طلب: مجهول";
  return `طلب: ${Math.trunc(id)}`;
}

export function archiveCaption(input: { who?: ArchiveWho | null; sourceUrl?: string | null }): string {
  return [archiveWhoLine(input.who), input.sourceUrl].filter(Boolean).join("\n");
}

function vaultArchiveOff(): boolean {
  const raw = (process.env.BARQ_VAULT_ARCHIVE_ENABLED ?? "").trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(raw)) return true;
  return VAULT_ARCHIVE_ENABLED === false;
}

async function notifyOwner(text: string) {
  const last = Date.parse((await getSettings().catch(() => ({} as Record<string, string>))).vault_fail_at || "");
  if (Number.isFinite(last) && Date.now() - last < 10 * 60 * 1000) return;
  await setSetting("vault_fail_at", new Date().toISOString()).catch(() => undefined);
  await telegram.sendMessage(Number(OWNER_TG_ID), text).catch(() => undefined);
}

export async function archiveDelivered(input: {
  fromChatId: number;
  messageIds: number[];
  sourceUrl?: string;
  mediaUrl?: string;
  kind?: string;
  who?: ArchiveWho;
}): Promise<boolean | undefined> {
  try {
    if (vaultArchiveOff()) return;
    const dest = (await vaultChatId()) || (await probeAndBindVault()) || CHANNEL_CHAT;
    const caption = archiveCaption({ who: input.who, sourceUrl: input.sourceUrl });
    let ok = false;
    let lastErr = "";
    for (const id of input.messageIds) {
      try {
        await telegram.copyMessage(dest, input.fromChatId, id, { caption });
        ok = true;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : "copy failed";
        try {
          await telegram.copyMessage(dest, input.fromChatId, id);
          ok = true;
        } catch (err2) {
          lastErr = err2 instanceof Error ? err2.message : lastErr;
        }
      }
    }
    if (!ok && input.mediaUrl) {
      try {
        if (input.kind === "photo") {
          await telegram.sendPhotoUrl(dest, input.mediaUrl, { caption });
        } else if (!/youtube\.com|youtu\.be|googlevideo/i.test(input.mediaUrl)) {
          await telegram.sendVideoUrl(dest, input.mediaUrl, { caption });
        } else {
          throw new Error("youtube cdn");
        }
        ok = true;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : "send media failed";
      }
    }
    if (!ok) {
      await notifyOwner(
        `النسخ لقناة التحديثات فشل ⚡️\nالوجهة: ${dest}\n${lastErr}\nما أنزل الرابط كنص عشان ما يصير معاينة يوتيوب فاضية.`,
      );
    }
    if (ok) {
      try {
        const { logEvent } = await import("./observability.server");
        await logEvent({ action: "archive", status: "ok", tgId: input.who?.id });
      } catch {
        /* ignore */
      }
    }
    return ok;
  } catch {
    // Vault failure must never fail the user download.
    return false;
  }
}

export function vaultBindHelp(): string {
  return `قناة التحديثات الخاصة

البوت لازم يكون مشرف (نشر رسائل).

اربطها الآن بواحد من هالثلاث:
1. حوّل أي رسالة من القناة إلى هنا
2. اكتب حرف داخل القناة
3. أرسل رقم القناة مثل -1001234567890

بعد الربط كل فيديو يتحمل ينسخ هناك مع معرّف تليجرام فقط.`;
}
