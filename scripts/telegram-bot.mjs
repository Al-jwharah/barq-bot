#!/usr/bin/env node
/**
 * Thin Telegram poller. Forwards updates to the app; never handles messages itself.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const API = `https://api.telegram.org/bot${TOKEN}`;
const APP = process.env.BARQ_APP_URL || "http://127.0.0.1:8080/api/telegram";
const STATE_PATH = "/tmp/direct-bot-state.json";
const ROOT = process.cwd();
const OWNER_ID = 8471762251;

const state = {
  running: true,
  mode: "polling",
  username: "barq_ibot",
  displayName: "برق | Barq Vid",
  lastOkAt: Date.now(),
  processed: 0,
  lastError: null,
  members: 0,
};

function writeState() {
  try {
    writeFileSync(STATE_PATH, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

async function tg(method, body, timeoutMs = 35000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.description || method);
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

async function applyProfile() {
  await tg("setMyName", { name: "برق | Barq Vid" }).catch(() => undefined);
  await tg("setMyDescription", {
    description:
      "برق يحمّل أي فيديو أو صورة بضغطة. انسخ الرابط من تيك توك أو إنستغرام أو يوتيوب أو إكس أو فيسبوك والصقه هنا. يصلك بأعلى جودة — نظيف، بلا كلام المصدر. خمس تحميلات مجانية بعد الانضمام للقناة، ثم اشتراك بـ 4.99 ريال بنجوم تليجرام: بلا حدود ورابط مختصر لكل مقطع.",
  }).catch(() => undefined);
  await tg("setMyShortDescription", {
    short_description: "انسخ الرابط. برق يحمّله بأعلى جودة — نظيف وسريع.",
  }).catch(() => undefined);
  const publicCommands = [
    { command: "start", description: "بدء التحميل والتعليمات" },
    { command: "help", description: "كيف يعمل" },
    { command: "sub", description: "الاشتراك" },
    { command: "code", description: "كود تفعيل" },
    { command: "join", description: "التحقق من الانضمام للقناة" },
    { command: "support", description: "الدعم الفني" },
  ];
  const ownerCommands = [
    ...publicCommands,
    { command: "panel", description: "لوحة التحكم" },
    { command: "grok", description: "نموذج جروك" },
    { command: "watch", description: "مراقبة التحميل" },
    { command: "admin", description: "لوحة المشرف" },
  ];
  await tg("setMyCommands", { commands: publicCommands }).catch(() => undefined);
  await tg("setMyCommands", {
    commands: ownerCommands,
    scope: { type: "chat", chat_id: OWNER_ID },
  }).catch(() => undefined);
  try {
    const photo = readFileSync(join(ROOT, "public/logo.jpg"));
    const form = new FormData();
    form.set("photo", JSON.stringify({ type: "static", photo: "attach://pic" }));
    form.set("pic", new Blob([photo], { type: "image/jpeg" }), "logo.jpg");
    await fetch(`${API}/setMyProfilePhoto`, { method: "POST", body: form });
  } catch {
    /* Bot API may not allow profile photo — BotFather still works */
  }
}

async function forward(update) {
  const res = await fetch(APP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`app ${res.status}`);
}

async function main() {
  await tg("deleteWebhook", { drop_pending_updates: false }).catch(() => undefined);
  try {
    const me = await tg("getMe", {}, 10000);
    state.username = me.username ?? state.username;
    state.displayName = me.first_name ?? state.displayName;
    state.running = true;
    state.mode = "polling";
    state.lastOkAt = Date.now();
    writeState();
    console.log(`[barq-bot] @${state.username} polling → ${APP}`);
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : "getMe failed";
    writeState();
    console.error("[barq-bot] getMe", err);
  }
  await applyProfile();
  try {
    const me = await tg("getMe", {}, 8000);
    state.displayName = me.first_name ?? state.displayName;
    writeState();
  } catch {
    /* keep */
  }

  let offset = 0;
  for (;;) {
    try {
      const updates = await tg(
        "getUpdates",
        {
          offset,
          timeout: 25,
          allowed_updates: ["message", "callback_query", "pre_checkout_query"],
        },
        35000,
      );
      state.lastOkAt = Date.now();
      state.running = true;
      state.lastError = null;
      writeState();
      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await forward(update);
          state.processed += 1;
          state.lastOkAt = Date.now();
          writeState();
        } catch (err) {
          state.lastError = err instanceof Error ? err.message : "forward failed";
          writeState();
          console.error("[barq-bot] forward", err);
        }
      }
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : "polling failed";
      writeState();
      console.error("[barq-bot]", err);
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
}

writeState();
main();
