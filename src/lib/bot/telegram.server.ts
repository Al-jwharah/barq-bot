import { OWNER_TG_ID, TELEGRAM_API } from "./config.server";

export type TgUser = { id: number; username?: string; first_name?: string };
export type TgChat = { id: number; type: string; title?: string; username?: string };
export type TgEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
};
export type TgSuccessfulPayment = {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id?: string;
};
export type TgMessage = {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  caption?: string;
  entities?: TgEntity[];
  caption_entities?: TgEntity[];
  successful_payment?: TgSuccessfulPayment;
  photo?: Array<{ file_id: string; width: number; height: number }>;
  video?: { file_id: string };
  video_note?: { file_id: string };
  animation?: { file_id: string };
  audio?: { file_id: string; file_name?: string; mime_type?: string };
  voice?: { file_id: string; mime_type?: string };
  sticker?: { file_id: string; emoji?: string; set_name?: string };
  document?: { file_id: string; mime_type?: string; file_name?: string };
  forward_from?: TgUser;
  forward_from_chat?: TgChat;
  web_page?: { url?: string; display_url?: string };
  forward_origin?: {
    type: string;
    sender_user?: TgUser;
    chat?: TgChat;
  };
};
export type TgCallbackQuery = {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
};
export type TgPreCheckoutQuery = {
  id: string;
  from: TgUser;
  currency: string;
  total_amount: number;
  invoice_payload: string;
};
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
  pre_checkout_query?: TgPreCheckoutQuery;
  my_chat_member?: {
    chat: { id: number; title?: string; type: string; username?: string };
    new_chat_member?: { status?: string };
  };
  channel_post?: TgMessage;
};

export type TgBtn = { text: string; url?: string; callback_data?: string };

async function call<T>(
  method: string,
  body?: Record<string, unknown>,
  timeoutMs = 35000,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : "{}",
      signal: ctrl.signal,
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) {
      throw new Error(json.description || `Telegram ${method} failed`);
    }
    return json.result as T;
  } finally {
    clearTimeout(timer);
  }
}

export const telegram = {
  getMe: () =>
    call<{ id: number; username?: string; first_name?: string }>("getMe", undefined, 10000),
  getUpdates: (offset: number, timeout = 25) =>
    call<TgUpdate[]>(
      "getUpdates",
      {
        offset,
        timeout,
        allowed_updates: [
          "message",
          "callback_query",
          "pre_checkout_query",
          "my_chat_member",
          "channel_post",
        ],
      },
      timeout * 1000 + 8000,
    ),
  deleteWebhook: () => call("deleteWebhook", { drop_pending_updates: false }, 10000),
  setWebhook: (url: string, secretToken?: string) =>
    call(
      "setWebhook",
      {
        url,
        secret_token: secretToken || undefined,
        allowed_updates: [
          "message",
          "callback_query",
          "pre_checkout_query",
          "my_chat_member",
          "channel_post",
        ],
      },
      10000,
    ),
  getWebhookInfo: () =>
    call<{ url: string; pending_update_count?: number; last_error_message?: string }>(
      "getWebhookInfo",
      undefined,
      10000,
    ),
  sendMessage: (chatId: number | string, text: string, extra?: Record<string, unknown>) =>
    call<TgMessage>(
      "sendMessage",
      { chat_id: chatId, text, disable_web_page_preview: true, ...extra },
      20000,
    ),
  editMessageText: (
    chatId: number,
    messageId: number,
    text: string,
    extra?: Record<string, unknown>,
  ) =>
    call(
      "editMessageText",
      {
        chat_id: chatId,
        message_id: messageId,
        text,
        disable_web_page_preview: true,
        ...extra,
      },
      15000,
    ),
  deleteMessage: (chatId: number, messageId: number) =>
    call("deleteMessage", { chat_id: chatId, message_id: messageId }, 8000).catch(() => undefined),
  sendChatAction: (chatId: number, action: string) =>
    call("sendChatAction", { chat_id: chatId, action }, 8000).catch(() => undefined),
  sendPhotoUrl: (chatId: number | string, photo: string, extra?: Record<string, unknown>) =>
    call<TgMessage>("sendPhoto", { chat_id: chatId, photo, ...extra }, 60000),
  sendVideoUrl: (chatId: number | string, video: string, extra?: Record<string, unknown>) =>
    call<TgMessage>("sendVideo", { chat_id: chatId, video, ...extra }, 120000),
  sendAnimationUrl: (chatId: number | string, animation: string, extra?: Record<string, unknown>) =>
    call<TgMessage>("sendAnimation", { chat_id: chatId, animation, ...extra }, 120000),
  sendAudioUrl: (chatId: number, audio: string, extra?: Record<string, unknown>) =>
    call<TgMessage>("sendAudio", { chat_id: chatId, audio, ...extra }, 120000),
  sendMediaGroup: (chatId: number, media: unknown[]) =>
    call("sendMediaGroup", { chat_id: chatId, media }, 120000),
  answerCallback: (id: string, text?: string, alert = false) =>
    call(
      "answerCallbackQuery",
      { callback_query_id: id, text, show_alert: alert },
      8000,
    ).catch(() => undefined),
  getChatMember: (chatId: string | number, userId: number) =>
    call<{ status: string }>(
      "getChatMember",
      { chat_id: chatId, user_id: userId },
      10000,
    ),
  getChat: (chatId: string | number) =>
    call<TgChat>("getChat", { chat_id: chatId }, 10000),
  getFile: (fileId: string) =>
    call<{ file_id: string; file_path?: string; file_size?: number }>(
      "getFile",
      { file_id: fileId },
      15000,
    ),
  editMessageReplyMarkup: (
    chatId: number,
    messageId: number,
    replyMarkup: unknown,
  ) =>
    call(
      "editMessageReplyMarkup",
      { chat_id: chatId, message_id: messageId, reply_markup: replyMarkup },
      10000,
    ),
  answerPreCheckout: (id: string, ok = true, error?: string) =>
    call(
      "answerPreCheckoutQuery",
      {
        pre_checkout_query_id: id,
        ok,
        error_message: error,
      },
      8000,
    ),
  sendInvoice: (chatId: number, body: Record<string, unknown>) =>
    call("sendInvoice", { chat_id: chatId, ...body }, 20000),
  copyMessage: (
    toChatId: string | number,
    fromChatId: string | number,
    messageId: number,
    extra?: Record<string, unknown>,
  ) =>
    call<TgMessage>(
      "copyMessage",
      { chat_id: toChatId, from_chat_id: fromChatId, message_id: messageId, ...extra },
      20000,
    ),
  pinChatMessage: (chatId: string | number, messageId: number, silent = true) =>
    call("pinChatMessage", { chat_id: chatId, message_id: messageId, disable_notification: silent }, 10000),
  unpinChatMessage: (chatId: string | number, messageId?: number) =>
    call(
      "unpinChatMessage",
      messageId ? { chat_id: chatId, message_id: messageId } : { chat_id: chatId },
      8000,
    ).catch(() => undefined),
  setChatTitle: (chatId: string | number, title: string) =>
    call("setChatTitle", { chat_id: chatId, title }, 10000),
  setChatDescription: (chatId: string | number, description: string) =>
    call("setChatDescription", { chat_id: chatId, description }, 10000),
  setMyName: (name: string) => call("setMyName", { name }, 10000).catch(() => undefined),
  setMyDescription: (description: string) =>
    call("setMyDescription", { description }, 10000).catch(() => undefined),
  setMyShortDescription: (short_description: string) =>
    call("setMyShortDescription", { short_description }, 10000).catch(() => undefined),
  setMyCommands: (
    commands: Array<{ command: string; description: string }>,
    scope?: Record<string, unknown>,
  ) => call("setMyCommands", scope ? { commands, scope } : { commands }, 10000).catch(() => undefined),
  deleteMyCommands: (scope?: Record<string, unknown>) =>
    call("deleteMyCommands", scope ? { scope } : {}, 8000).catch(() => undefined),
};

export const PUBLIC_COMMANDS = [
  { command: "start", description: "بدء التحميل" },
  { command: "help", description: "كيف يعمل" },
  { command: "status", description: "حالة برق" },
  { command: "ai", description: "Barq AI" },
  { command: "short", description: "رابط مختصر 24 ساعة" },
  { command: "account", description: "حسابي على الويب" },
  { command: "invite", description: "دعوة أصدقاء" },
  { command: "live", description: "متابعة بث مباشر" },
  { command: "points", description: "نقاط برق" },
  { command: "support", description: "الدعم الفني" },
];

export const OWNER_COMMANDS = [
  ...PUBLIC_COMMANDS,
  { command: "panel", description: "لوحة التحكم" },
  { command: "grok", description: "نموذج جروك" },
  { command: "watch", description: "مراقبة التحميل" },
  { command: "admin", description: "لوحة المشرف" },
];

export const BOT_COMMANDS = PUBLIC_COMMANDS;

export async function ensureBotCommands() {
  await telegram.deleteMyCommands();
  await telegram.deleteMyCommands({ type: "all_private_chats" });
  await telegram.deleteMyCommands({ type: "all_group_chats" });
  await telegram.setMyCommands(PUBLIC_COMMANDS);
  await telegram.setMyCommands(PUBLIC_COMMANDS, { type: "all_private_chats" });
  await telegram.setMyCommands(OWNER_COMMANDS, { type: "chat", chat_id: Number(OWNER_TG_ID) });
}

export async function sendDocumentFile(
  chatId: number,
  blob: Blob,
  filename: string,
  extra: Record<string, string> = {},
) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("document", blob, filename);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const res = await fetch(`${TELEGRAM_API}/sendDocument`, { method: "POST", body: form });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(json.description || "sendDocument failed");
}

export async function sendVideoFile(
  chatId: number,
  blob: Blob,
  filename: string,
  extra: Record<string, string> = {},
) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("video", blob, filename);
  form.set("supports_streaming", "true");
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const res = await fetch(`${TELEGRAM_API}/sendVideo`, { method: "POST", body: form });
  const json = (await res.json()) as {
    ok: boolean;
    result?: { message_id?: number; video?: { file_id: string } };
    description?: string;
  };
  if (!json.ok) throw new Error(json.description || "sendVideo failed");
  return { file_id: json.result?.video?.file_id, message_id: json.result?.message_id };
}

export async function sendAudioFile(
  chatId: number,
  blob: Blob,
  filename: string,
  extra: Record<string, string> = {},
) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("audio", blob, filename);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const res = await fetch(`${TELEGRAM_API}/sendAudio`, { method: "POST", body: form });
  const json = (await res.json()) as {
    ok: boolean;
    result?: { message_id?: number; audio?: { file_id: string } };
    description?: string;
  };
  if (!json.ok) throw new Error(json.description || "sendAudio failed");
  return { file_id: json.result?.audio?.file_id, message_id: json.result?.message_id };
}

export async function sendPhotoFile(
  chatId: number,
  blob: Blob,
  filename: string,
  extra: Record<string, string> = {},
) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("photo", blob, filename);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const res = await fetch(`${TELEGRAM_API}/sendPhoto`, { method: "POST", body: form });
  const json = (await res.json()) as {
    ok: boolean;
    result?: { photo?: Array<{ file_id: string }> };
    description?: string;
  };
  if (!json.ok) throw new Error(json.description || "sendPhoto failed");
  const photos = json.result?.photo;
  return photos?.[photos.length - 1]?.file_id;
}

export async function sendAnimationFile(
  chatId: number,
  blob: Blob,
  filename: string,
  extra: Record<string, string> = {},
) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("animation", blob, filename);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const res = await fetch(`${TELEGRAM_API}/sendAnimation`, { method: "POST", body: form });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(json.description || "sendAnimation failed");
}

export async function setMyProfilePhoto(blob: Blob, filename = "logo.jpg") {
  const form = new FormData();
  form.set("photo", JSON.stringify({ type: "static", photo: "attach://pic" }));
  form.set("pic", blob, filename);
  const res = await fetch(`${TELEGRAM_API}/setMyProfilePhoto`, { method: "POST", body: form });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(json.description || "setMyProfilePhoto failed");
}

export async function setMyAnimatedProfilePhoto(blob: Blob, filename = "intro.mp4") {
  const form = new FormData();
  form.set("photo", JSON.stringify({ type: "animated", animation: "attach://anim" }));
  form.set("anim", blob, filename);
  const res = await fetch(`${TELEGRAM_API}/setMyProfilePhoto`, { method: "POST", body: form });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(json.description || "setMyProfilePhoto animated failed");
}

export function inlineKeyboard(rows: TgBtn[][]) {
  return {
    inline_keyboard: rows.map((row) =>
      row.map((b) => {
        if (b.url) return { text: b.text, url: b.url };
        return { text: b.text, callback_data: b.callback_data ?? "go:menu" };
      }),
    ),
  };
}

export function replyKeyboard(rows: string[][]) {
  return {
    keyboard: rows.map((row) => row.map((text) => ({ text }))),
    resize_keyboard: true,
    is_persistent: true,
  };
}

export const REMOVE_KEYBOARD = { remove_keyboard: true };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/>/g, "&" + "gt;");
}

export function normalizeMediaUrl(raw: string): string {
  const t = raw.trim().replace(/[),.]+$/g, "");
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(t)) return `https://${t}`;
  return t;
}

export function urlsFromMessage(msg: TgMessage): string[] {
  const text = msg.text ?? msg.caption ?? "";
  const entities = [...(msg.entities ?? []), ...(msg.caption_entities ?? [])];
  const urls: string[] = [];
  for (const e of entities) {
    if (e.type === "url") {
      urls.push(text.substring(e.offset, e.offset + e.length));
    } else if (e.type === "text_link" && e.url) {
      urls.push(e.url);
    }
  }
  const extra = text.match(/(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com|t\.co|tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com|instagram\.com|instagr\.am|youtube\.com|youtu\.be|facebook\.com|fb\.watch|reddit\.com|vimeo\.com|threads\.(?:net|com)|dailymotion\.com|snapchat\.com|pinterest\.com|twitch\.tv|rumble\.com)\/[^\s<>"')\]]+/gi) ?? [];
  for (const u of extra) {
    if (!urls.includes(u)) urls.push(u);
  }
  const https = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  for (const u of https) {
    if (!urls.includes(u)) urls.push(u);
  }
  const page = msg.web_page?.url ?? msg.web_page?.display_url;
  if (page && !urls.includes(page)) urls.push(page);
  return [...new Set(urls.map(normalizeMediaUrl).filter((u) => /^https?:\/\//i.test(u)))];
}
