import { GROK_MODELS, GROK_MODEL_META, grokModelLabel, isOwnerId, type GrokModel } from "./config.server";
import { grokReady } from "./grok.server";
import { awaitMap, inGrokMode, setGrokMode, type AwaitKind } from "./session.server";
import { botSettings, channelProbe, type BotSettings } from "./settings.server";
import { inlineKeyboard, replyKeyboard, telegram, type TgBtn, type TgCallbackQuery } from "./telegram.server";
import { can, type Role } from "./roles.server";
import { permForCallback } from "./acl.server";

export const OWNER_KEYBOARD = replyKeyboard([
  ["لوحة التحكم", "Barq AI"],
  ["رابط مؤقت", "رفع ملف"],
  ["لخّصه", "كابشن"],
  ["سجلي", "حدّي"],
  ["المراقبة", "النظام"],
  ["إرسال للجميع", "أخبار القناة"],
  ["القناة والمجاني", "المعجبون"],
  ["مسح شامل", "ربط التخزين"],
  ["دعم فني"],
]);

export const GROK_KEYBOARD = replyKeyboard([
  ["إنهاء Barq AI", "النماذج"],
  ["انشر في القناة", "اسحب فائز"],
  ["لوحة التحكم", "المراقبة"],
  ["القائمة"],
]);

function flag(on: boolean): string {
  return on ? "تشغيل" : "إيقاف";
}

function speedLabel(v: string): string {
  if (v === "fast") return "سريع";
  if (v === "thorough") return "متعمق";
  return "متوازن";
}

function modelCallback(model: GrokModel): string {
  if (model === "grok-4.5") return "adm:m45";
  if (model === "grok-4") return "adm:m4";
  return "adm:m3";
}

async function homeText(): Promise<string> {
  const s = await botSettings();
  const stats = await (await import("./store.server")).adminStats();
  const channel = s.requiredChannel ? `@${s.requiredChannel}` : "غير معيّنة";
  const grok = grokReady() && s.grokOwner ? grokModelLabel(s.grokModel) : "متوقف";
  const q = await (await import("../jobs/queue.server")).jobStats().catch(() => null);
  return `لوحة تحكم برق

البوت: ${s.paused ? "متوقف" : "يعمل"}
جروك: ${grok} · ${speedLabel(s.grokSpeed)}
القناة: ${channel} · المجاني ${s.freeDownloads}

أعضاء ${stats.members} · مشتركون ${stats.subscribers} · تحميلات ${stats.downloads}
إيراد نجوم ${stats.stars} · حجب ${stats.blocked} · فشل ${stats.failed}
الطابور: ${q ? `${q.pending} انتظار · ${q.processing} جاري · ${q.failedToday} فشل اليوم` : "—"}
معجبون ${(await (await import("./growth.server")).likeCount())}

أول زر: اختيار نموذج جروك.`;
}

async function homeButtons(s: BotSettings, role: Role = "owner"): Promise<TgBtn[][]> {
  const likes = await (await import("./growth.server")).likeCount().catch(() => 0);
  const rows: TgBtn[][] = [
    [{ text: `Barq AI: ${grokModelLabel(s.grokModel)}`, callback_data: "adm:grok" }],
    [
      { text: s.paused ? "تشغيل البوت" : "إيقاف البوت", callback_data: s.paused ? "adm:run" : "adm:pause" },
      { text: s.adsEnabled ? "تشغيل الإعلان لاحقًا" : "الإعلان مطفأ", callback_data: "adm:ads" },
    ],
    [
      { text: "القناة والمجاني", callback_data: "adm:ch" },
      { text: "النظام", callback_data: "adm:sys" },
    ],
    [
      { text: "نص الإعلان", callback_data: "adm:ads_txt" },
      { text: "إرسال للجميع", callback_data: "adm:bc" },
    ],
    [
      { text: "إحصائيات", callback_data: "adm:stat" },
      { text: `المعجبون · ${likes}`, callback_data: "adm:likes" },
    ],
    [
      { text: "تحليلات 7 أيام", callback_data: "adm:insight" },
      { text: "تقرير أسبوعي", callback_data: "adm:week" },
    ],
    [{ text: "خطة @barq_all", callback_data: "adm:launch" }],
    [
      { text: "مراقبة", callback_data: "adm:watch" },
      { text: "مسح شامل للجميع", callback_data: "adm:wipe" },
    ],
    [
      { text: "المهام", callback_data: "adm:jobs" },
      { text: "البلاغات", callback_data: "adm:reports" },
    ],
    [{ text: "تذاكر الدعم", callback_data: "adm:tickets" }],
  ];
  return rows
    .map((row) =>
      row.filter((btn) => {
        const perm = permForCallback(btn.callback_data ?? "");
        return !perm || can(role, perm);
      }),
    )
    .filter((row) => row.length > 0);
}

async function grokText(): Promise<string> {
  const s = await botSettings();
  const meta = GROK_MODEL_META[s.grokModel];
  return `نموذج Barq AI

المختار الآن: ${meta.label}
${meta.hint}
السرعة: ${speedLabel(s.grokSpeed)}
المحادثة: ${flag(s.grokOwner)}
الأدوات: ${flag(s.grokTools)} · البحث: ${flag(s.grokWebSearch)}
المفتاح: ${grokReady() ? "متصل" : "غير متصل"}

اضغط «بدء المحادثة» ثم اكتب — Barq AI يرد وينفّذ أوامرك على البوت.`;
}

function grokButtons(s: BotSettings): TgBtn[][] {
  const models: TgBtn[][] = GROK_MODELS.map((model) => {
    const meta = GROK_MODEL_META[model];
    const selected = s.grokModel === model;
    return [
      {
        text: selected ? `✓ ${meta.label} — ${meta.hint}` : `${meta.label} — ${meta.hint}`,
        callback_data: modelCallback(model),
      },
    ];
  });
  return [
    [{ text: "بدء المحادثة مع Barq AI", callback_data: "adm:grok_on" }],
    ...models,
    [
      { text: s.grokSpeed === "fast" ? "• سريع" : "سريع", callback_data: "adm:s_fast" },
      { text: s.grokSpeed === "balanced" ? "• متوازن" : "متوازن", callback_data: "adm:s_bal" },
      { text: s.grokSpeed === "thorough" ? "• متعمق" : "متعمق", callback_data: "adm:s_deep" },
    ],
    [{ text: s.grokOwner ? "إيقاف المحادثة" : "تشغيل المحادثة", callback_data: "adm:g_chat" }],
    [
      { text: s.grokTools ? "إيقاف الأدوات" : "تشغيل الأدوات", callback_data: "adm:g_tools" },
      { text: s.grokWebSearch ? "إيقاف البحث" : "تشغيل البحث", callback_data: "adm:g_web" },
    ],
    [{ text: "رجوع للوحة", callback_data: "adm:home" }],
  ];
}

async function sysText(): Promise<string> {
  const s = await botSettings();
  return `النظام والقيود

القيود على المستخدمين: ${flag(s.restrictionsOn)}
حد 5 يومياً: ${flag(s.dailyCapOn)}
البوت: ${s.paused ? "متوقف" : "يعمل"}

حالياً حد 5 مقاطع/يوم من BARQ_DAILY_CAP_ON أو زر التشغيل. الإعلانات لاحقاً.`;
}

function sysButtons(s: BotSettings): TgBtn[][] {
  return [
    [{ text: s.restrictionsOn ? "إيقاف القيود" : "تشغيل القيود", callback_data: "adm:rest" }],
    [{ text: s.dailyCapOn ? "إيقاف حد 5/يوم" : "تشغيل حد 5/يوم", callback_data: "adm:cap" }],
    [{ text: s.paused ? "تشغيل البوت" : "إيقاف البوت", callback_data: s.paused ? "adm:run" : "adm:pause" }],
    [{ text: "مسح شامل للجميع", callback_data: "adm:wipe" }],
    [{ text: "رجوع للوحة", callback_data: "adm:home" }],
  ];
}

async function channelText(): Promise<string> {
  const s = await botSettings();
  let probe = "—";
  if (s.requiredChannel) {
    const p = await channelProbe(s.requiredChannel);
    probe = p.ok ? "البوت يصل للقناة" : `تعذر التحقق: ${p.error}. اجعل البوت مشرفًا في القناة.`;
  }
  return `قناة التحميل المجاني + التحديثات

القناة: ${s.requiredChannel ? `@${s.requiredChannel}` : "غير معيّنة"}
عدد المجاني بعد الانضمام: ${s.freeDownloads}
التحقق: ${probe}

@barq_all للتحديثات والأخبار والمسابقات.
إذا لم تُعيَّن قناة، المجاني يُمنح مباشرة.`;
}

function channelButtons(): TgBtn[][] {
  return [
    [
      { text: "تعيين القناة", callback_data: "adm:ch_set" },
      { text: "عدد المجاني", callback_data: "adm:ch_n" },
    ],
    [
      { text: "نشر تحديث", callback_data: "adm:news" },
      { text: "بدء مسابقة", callback_data: "adm:contest" },
    ],
    [{ text: "انشر v1.4 في @barq_all", callback_data: "adm:news_now" }],
    [{ text: "مسح القناة", callback_data: "adm:ch_clr" }],
    [{ text: "رجوع للوحة", callback_data: "adm:home" }],
  ];
}

function codesText(): string {
  return `أكواد التفعيل

إصدار كود جديد أو إلغاء كود قائم.
بعد الضغط أرسل الصيغة المطلوبة.`;
}

function codesButtons(): TgBtn[][] {
  return [
    [
      { text: "إصدار كود", callback_data: "adm:code_new" },
      { text: "إلغاء كود", callback_data: "adm:code_off" },
    ],
    [{ text: "رجوع للوحة", callback_data: "adm:home" }],
  ];
}

function subsText(): string {
  return `اشتراكات الأعضاء

تفعيل يضيف أيامًا للمدة الحالية.
تعديل يعيد المدة من الآن — 0 يلغي الاشتراك.`;
}

function subsButtons(): TgBtn[][] {
  return [
    [
      { text: "تفعيل اشتراك", callback_data: "adm:grant" },
      { text: "تعديل اشتراك", callback_data: "adm:edit" },
    ],
    [{ text: "رجوع للوحة", callback_data: "adm:home" }],
  ];
}

async function show(
  chatId: number,
  messageId: number | undefined,
  text: string,
  buttons: TgBtn[][],
) {
  const extra = { reply_markup: inlineKeyboard(buttons) };
  if (messageId) {
    try {
      await telegram.editMessageText(chatId, messageId, text, extra);
      return;
    } catch {
      /* send new */
    }
  }
  await telegram.sendMessage(chatId, text, extra);
}

export async function sendOwnerPanel(chatId: number, messageId?: number) {
  const s = await botSettings();
  const { actorRole } = await import("./acl.server");
  const role = await actorRole(chatId);
  await show(chatId, messageId, await homeText(), await homeButtons(s, role));
}

export async function sendGrokPanel(chatId: number, messageId?: number) {
  const s = await botSettings();
  await show(chatId, messageId, await grokText(), grokButtons(s));
}

export async function sendOwnerCodes(chatId: number) {
  await show(chatId, undefined, codesText(), codesButtons());
}

export async function sendOwnerSubs(chatId: number) {
  await show(chatId, undefined, subsText(), subsButtons());
}

export async function sendOwnerSys(chatId: number) {
  const s = await botSettings();
  await show(chatId, undefined, await sysText(), sysButtons(s));
}

export async function sendOwnerChannel(chatId: number) {
  await show(chatId, undefined, await channelText(), channelButtons());
}

export async function sendOwnerNews(chatId: number) {
  const channel = await import("./channel.server");
  const rows = await channel.contestSummary(5);
  const list = rows.length
    ? rows.map((c) => `• ${c.status === "open" ? "مفتوحة" : "مغلقة"} ${c.title} — ${c.entries} مشارك`).join("\n")
    : "لا مسابقات بعد.";
  await telegram.sendMessage(
    chatId,
    `قناة @barq_all — تحديثات وأخبار ومسابقات

${list}

انشر تحديثًا، ابدأ مسابقة، أو اكتب لجروك.`,
    {
      reply_markup: inlineKeyboard([
        [
          { text: "نشر تحديث", callback_data: "adm:news" },
          { text: "بدء مسابقة", callback_data: "adm:contest" },
        ],
        [{ text: "اسحب فائز", callback_data: "adm:draw" }],
        [{ text: "جروك", callback_data: "adm:grok_on" }],
        [{ text: "رجوع للوحة", callback_data: "adm:home" }],
      ]),
    },
  );
}

export async function sendOwnerAds(chatId: number) {
  const s = await botSettings();
  const body = `الإعلان

الحالة: ${flag(s.adsEnabled)}
النص:
${s.adsText || "لا نص بعد."}

يظهر للمجاني بعد التحميل، وفي زر تجديد 5 فيديوهات.`;
  await show(chatId, undefined, body, [
    [{ text: s.adsEnabled ? "إيقاف الإعلان" : "تشغيل الإعلان", callback_data: "adm:ads" }],
    [{ text: "نص الإعلان", callback_data: "adm:ads_txt" }],
    [{ text: "رجوع للوحة", callback_data: "adm:home" }],
  ]);
}

export async function askBroadcast(chatId: number, fromId: number) {
  awaitMap().set(fromId, "broadcast");
  await telegram.sendMessage(chatId, "أرسل نص الإرسال الجماعي الآن.");
}

export async function enterGrokMode(chatId: number, fromId: number) {
  if (!isOwnerId(fromId) || !isOwnerId(chatId)) return;
  const store = await import("./store.server");
  await store.setSetting("grok_owner", "on");
  await store.setSetting("grok_tools", "on");
  setGrokMode(fromId, true);
  const s = await botSettings();
  const meta = GROK_MODEL_META[s.grokModel];
  const ready = grokReady();
  await telegram.sendMessage(
    chatId,
    ready
      ? `وضع Barq AI مفعّل — صلاحيات كاملة على البوت والقناة.

النموذج: ${meta.label} · ${meta.hint}

اكتب أي شيء الآن.

للخروج: إنهاء Barq AI`
      : `وضع Barq AI فُتح لكن المفتاح غير متصل. لوحة التحكم ما زالت تعمل.`,
    { reply_markup: GROK_KEYBOARD },
  );
}

export async function exitGrokMode(chatId: number, fromId: number) {
  setGrokMode(fromId, false);
  await telegram.sendMessage(chatId, "خرجت من محادثة Barq AI. الأزرار العادية رجعت.", {
    reply_markup: OWNER_KEYBOARD,
  });
}

export async function handleOwnerAwait(
  chatId: number,
  fromId: number,
  kind: AwaitKind,
  text: string,
): Promise<boolean> {
  const store = await import("./store.server");
  const { normalizeChannel } = await import("./brand");

  if (kind === "newcode") {
    const [code, daysRaw, usesRaw] = text.split(/\s+/);
    const days = Number(daysRaw ?? 30);
    const uses = Number(usesRaw ?? 20);
    if (!code || !/^[A-Za-z0-9_-]{3,24}$/.test(code) || !Number.isFinite(days) || !Number.isFinite(uses)) {
      await telegram.sendMessage(chatId, "الصيغة: CODE أيام استخدامات\nمثال: BARQ30 30 20");
      return true;
    }
    const saved = await store.createCode(code, days, uses);
    await telegram.sendMessage(chatId, `تم إصدار الكود ${saved} — ${days} يوم × ${uses}`);
    return true;
  }
  if (kind === "cancelcode") {
    const code = text.trim();
    if (!code) {
      await telegram.sendMessage(chatId, "أرسل الكود لإلغائه.");
      return true;
    }
    await store.setCodeActive(code, false);
    await telegram.sendMessage(chatId, `أُلغي الكود ${code.toUpperCase()}`);
    return true;
  }
  if (kind === "grant") {
    const [tgId, daysRaw] = text.split(/\s+/);
    const days = Number(daysRaw ?? 30);
    if (!tgId || !/^\d{3,20}$/.test(tgId) || !Number.isFinite(days)) {
      await telegram.sendMessage(chatId, "الصيغة: TELEGRAM_ID أيام\nمثال: 123456789 30");
      return true;
    }
    await store.grantDays(tgId, days);
    await telegram.sendMessage(chatId, `تم منح ${days} يوم للمستخدم ${tgId}`);
    return true;
  }
  if (kind === "editsub") {
    const [tgId, daysRaw] = text.split(/\s+/);
    const days = Number(daysRaw ?? 0);
    if (!tgId || !/^\d{3,20}$/.test(tgId) || !Number.isFinite(days)) {
      await telegram.sendMessage(chatId, "الصيغة: TELEGRAM_ID أيام\n0 يلغي الاشتراك.");
      return true;
    }
    await store.setSubscriptionDays(tgId, days);
    await telegram.sendMessage(
      chatId,
      days <= 0 ? `أُلغي اشتراك ${tgId}` : `اشتراك ${tgId} صار ${days} يوم من الآن`,
    );
    return true;
  }
  if (kind === "channel") {
    const handle = normalizeChannel(text);
    if (text.trim() && !handle) {
      await telegram.sendMessage(chatId, "يوزر غير صالح. مثال: @mychannel أو https://t.me/mychannel");
      return true;
    }
    await store.setSetting("required_channel", handle);
    await telegram.sendMessage(
      chatId,
      handle ? `القناة: @${handle}\nاجعل البوت مشرفًا فيها ليتحقق من الأعضاء.` : "أُزيل شرط القناة.",
    );
    return true;
  }
  if (kind === "free_n") {
    const n = Number(text.trim());
    if (!Number.isFinite(n) || n < 0 || n > 50) {
      await telegram.sendMessage(chatId, "أدخل رقمًا من 0 إلى 50.");
      return true;
    }
    await store.setSetting("free_downloads", String(Math.floor(n)));
    await telegram.sendMessage(chatId, `المجاني بعد الانضمام: ${Math.floor(n)}`);
    return true;
  }
  if (kind === "ads_text") {
    const copy = text.trim().slice(0, 1000);
    await store.setSetting("ads_text", copy);
    await telegram.sendMessage(chatId, copy ? "حُفظ نص الإعلان." : "أُفرغ نص الإعلان.");
    return true;
  }
  if (kind === "broadcast") {
    const ids = await store.memberIds();
    let sent = 0;
    for (const id of ids) {
      try {
        await telegram.sendMessage(Number(id), text);
        sent += 1;
      } catch {
        /* skip */
      }
    }
    await telegram.sendMessage(chatId, `تم الإرسال إلى ${sent} من ${ids.length}`);
    return true;
  }
  if (kind === "news_post") {
    const channel = await import("./channel.server");
    const posted = await channel.postNews(text);
    if (posted) {
      await telegram.sendMessage(chatId, `نُشر التحديث في القناة (رسالة ${posted.messageId}).`);
    } else {
      const status = await channel.newsPublishStatus();
      await telegram.sendMessage(chatId, status.reason);
    }
    return true;
  }
  if (kind === "contest_post") {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const title = lines[0] || "";
    const prize = lines[1] || "جائزة برق";
    const winnersCount = Number(lines[2] ?? 1);
    const grantDays = Number(lines[3] ?? 0);
    const rules = lines.slice(4).join("\n");
    const channel = await import("./channel.server");
    const contest = await channel.startContest({ title, prize, rules, winnersCount, grantDays });
    await telegram.sendMessage(chatId, `بدأت المسابقة ${contest.id} في القناة.`);
    return true;
  }
  return false;
}

function ask(fromId: number, kind: AwaitKind, chatId: number, prompt: string) {
  awaitMap().set(fromId, kind);
  return telegram.sendMessage(chatId, prompt);
}

export async function handleOwnerPanelCallback(cb: TgCallbackQuery): Promise<void> {
  const { actorRole, permForCallback } = await import("./acl.server");
  const { can, isStaff } = await import("./roles.server");
  const role = await actorRole(cb.from.id);
  if (!isStaff(role)) {
    await telegram.answerCallback(cb.id, "لا صلاحية", true);
    return;
  }
  const chatId = cb.from.id;
  const messageId = cb.message?.message_id;
  const data = cb.data ?? "";
  const fromId = cb.from.id;
  const need = permForCallback(data);
  if (need && !can(role, need)) {
    await telegram.answerCallback(cb.id, "لا صلاحية", true);
    return;
  }
  const store = await import("./store.server");

  const toggle = async (key: string) => {
    const next = await store.toggleSetting(key);
    await telegram.answerCallback(cb.id, next === "on" ? "تشغيل" : "إيقاف");
  };

  if (data === "adm:home") {
    await telegram.answerCallback(cb.id);
    await sendOwnerPanel(chatId, messageId);
    return;
  }
  if (data === "adm:pause") {
    await store.setSetting("bot_paused", "on");
    await telegram.answerCallback(cb.id, "البوت متوقف");
    await sendOwnerPanel(chatId, messageId);
    return;
  }
  if (data === "adm:run") {
    await store.setSetting("bot_paused", "off");
    await telegram.answerCallback(cb.id, "البوت يعمل");
    await sendOwnerPanel(chatId, messageId);
    return;
  }
  if (data === "adm:ads") {
    await toggle("ads_enabled");
    await sendOwnerPanel(chatId, messageId);
    return;
  }
  if (data === "adm:ads_open") {
    await telegram.answerCallback(cb.id);
    await sendOwnerAds(chatId);
    return;
  }
  if (data === "adm:ads_txt") {
    await telegram.answerCallback(cb.id);
    await ask(fromId, "ads_text", chatId, "أرسل نص الإعلان الآن (يظهر بعد التحميل). أرسل - للمسح.");
    return;
  }
  if (data === "adm:bc") {
    await telegram.answerCallback(cb.id);
    await ask(fromId, "broadcast", chatId, "أرسل نص الإرسال الجماعي الآن.");
    return;
  }
  if (data === "adm:codes") {
    await telegram.answerCallback(cb.id);
    await show(chatId, messageId, codesText(), codesButtons());
    return;
  }
  if (data === "adm:subs") {
    await telegram.answerCallback(cb.id);
    await show(chatId, messageId, subsText(), subsButtons());
    return;
  }
  if (data === "adm:code_new") {
    await telegram.answerCallback(cb.id);
    await ask(fromId, "newcode", chatId, "أرسل: CODE أيام استخدامات\nمثال: BARQ30 30 20");
    return;
  }
  if (data === "adm:code_off") {
    await telegram.answerCallback(cb.id);
    await ask(fromId, "cancelcode", chatId, "أرسل الكود لإلغائه.");
    return;
  }
  if (data === "adm:grant") {
    await telegram.answerCallback(cb.id);
    await ask(fromId, "grant", chatId, "أرسل: TELEGRAM_ID أيام\nمثال: 123456789 30");
    return;
  }
  if (data === "adm:edit") {
    await telegram.answerCallback(cb.id);
    await ask(fromId, "editsub", chatId, "تعديل الاشتراك. أرسل: TELEGRAM_ID أيام\n0 يلغي الاشتراك.");
    return;
  }
  if (data === "adm:grok") {
    if (!isOwnerId(fromId)) {
      await telegram.answerCallback(cb.id);
      return;
    }
    await telegram.answerCallback(cb.id);
    await sendGrokPanel(chatId, messageId);
    return;
  }
  if (data === "adm:grok_on") {
    if (!isOwnerId(fromId)) {
      await telegram.answerCallback(cb.id, "للمالك فقط", true);
      return;
    }
    await telegram.answerCallback(cb.id, "جروك يسمعك");
    await enterGrokMode(chatId, fromId);
    return;
  }
  if (data === "adm:g_chat") {
    await toggle("grok_owner");
    const s = await botSettings();
    if (s.grokOwner) await enterGrokMode(chatId, fromId);
    else await exitGrokMode(chatId, fromId);
    await sendGrokPanel(chatId, messageId);
    return;
  }
  if (data === "adm:g_tools") {
    await toggle("grok_tools");
    await sendGrokPanel(chatId, messageId);
    return;
  }
  if (data === "adm:g_web") {
    await toggle("grok_web_search");
    await sendGrokPanel(chatId, messageId);
    return;
  }
  if (data === "adm:m45" || data === "adm:m4" || data === "adm:m3") {
    const model: GrokModel = data === "adm:m45" ? "grok-4.5" : data === "adm:m4" ? "grok-4" : "grok-3";
    await store.setSetting("grok_model", model);
    await telegram.answerCallback(cb.id, grokModelLabel(model));
    await sendGrokPanel(chatId, messageId);
    return;
  }
  if (data === "adm:s_fast" || data === "adm:s_bal" || data === "adm:s_deep") {
    const speed = data === "adm:s_fast" ? "fast" : data === "adm:s_deep" ? "thorough" : "balanced";
    await store.setSetting("grok_speed", speed);
    await telegram.answerCallback(cb.id, speedLabel(speed));
    await sendGrokPanel(chatId, messageId);
    return;
  }
  if (data === "adm:sys") {
    await telegram.answerCallback(cb.id);
    const s = await botSettings();
    await show(chatId, messageId, await sysText(), sysButtons(s));
    return;
  }
  if (data === "adm:rest") {
    await toggle("restrictions_on");
    const s = await botSettings();
    await show(chatId, messageId, await sysText(), sysButtons(s));
    return;
  }
  if (data === "adm:cap") {
    await toggle("daily_cap_on");
    const s = await botSettings();
    await show(chatId, messageId, await sysText(), sysButtons(s));
    return;
  }
  if (data === "adm:wipe") {
    await telegram.answerCallback(cb.id);
    await show(
      chatId,
      messageId,
      "مسح شامل للجميع\n\nيمسح: العدادات، الوظائف، الروابط المؤقتة، السجلات.\nالأعضاء يبقون.\nلا يمكن التراجع.",
      [
        [{ text: "تأكيد المسح للجميع", callback_data: "adm:wipe_ok" }],
        [{ text: "إلغاء", callback_data: "adm:home" }],
      ],
    );
    return;
  }
  if (data === "adm:wipe_ok") {
    const result = await store.wipeEveryone();
    await telegram.answerCallback(cb.id, "تم المسح");
    await show(
      chatId,
      messageId,
      `تم المسح الشامل.\nالأعضاء المتبقون: ${result.members}\nالعدادات والروابط والوظائف صُفّرت عند الكل.`,
      [[{ text: "رجوع للوحة", callback_data: "adm:home" }]],
    );
    return;
  }
  if (data === "adm:ch") {
    await telegram.answerCallback(cb.id);
    await show(chatId, messageId, await channelText(), channelButtons());
    return;
  }
  if (data === "adm:ch_set") {
    await telegram.answerCallback(cb.id);
    await ask(fromId, "channel", chatId, "أرسل يوزر القناة: @channel أو رابط t.me");
    return;
  }
  if (data === "adm:ch_n") {
    await telegram.answerCallback(cb.id);
    await ask(fromId, "free_n", chatId, "أرسل عدد التحميلات المجانية بعد الانضمام (0–50).");
    return;
  }
  if (data === "adm:ch_clr") {
    await store.setSetting("required_channel", "");
    await telegram.answerCallback(cb.id, "أُزيلت القناة");
    await show(chatId, messageId, await channelText(), channelButtons());
    return;
  }
  if (data === "adm:news") {
    await telegram.answerCallback(cb.id);
    await ask(fromId, "news_post", chatId, "أرسل نص التحديث ليُنشر في @barq_all");
    return;
  }
  if (data === "adm:news_now") {
    await telegram.answerCallback(cb.id, "جاري النشر…");
    const ch = await import("./channel.server");
    const posted = await ch.postNews(ch.RELEASE_NOTES_V14, true);
    if (posted) {
      await telegram.sendMessage(chatId, `نُشر v1.4 في @barq_all (رسالة ${posted.messageId}).`);
    } else {
      const status = await ch.newsPublishStatus();
      await telegram.sendMessage(chatId, status.reason);
    }
    return;
  }
  if (data === "adm:contest") {
    await telegram.answerCallback(cb.id);
    await ask(
      fromId,
      "contest_post",
      chatId,
      "أرسل المسابقة سطرًا سطرًا:\nالعنوان\nالجائزة\nعدد الفائزين\nأيام الاشتراك للفائز (0 بدون)\nثم الشروط اختياريًا",
    );
    return;
  }
  if (data === "adm:draw") {
    await telegram.answerCallback(cb.id);
    try {
      const channel = await import("./channel.server");
      const result = await channel.drawContest();
      await telegram.sendMessage(
        chatId,
        `سُحب ${result.winners.length} فائز لمسابقة «${result.title}».`,
      );
    } catch (err) {
      await telegram.sendMessage(chatId, err instanceof Error ? err.message : "تعذر السحب");
    }
    return;
  }
  if (data === "adm:stat") {
    await telegram.answerCallback(cb.id);
    const stats = await store.adminStats();
    const s = await botSettings();
    const likes = await (await import("./growth.server")).likeCount();
    await telegram.sendMessage(
      chatId,
      `إحصائيات برق\nأعضاء ${stats.members}\nمعجبون ${likes}\nتحميلات ${stats.downloads}\nحجب ${stats.blocked}\nفشل ${stats.failed}\nروابط ${stats.clips}\nنجوم ${stats.stars}\nجروك ${grokReady() && s.grokOwner ? grokModelLabel(s.grokModel) : "متوقف"}`,
      { reply_markup: OWNER_KEYBOARD },
    );
    return;
  }
  if (data === "adm:insight") {
    await telegram.answerCallback(cb.id);
    const { analyticsReport } = await import("./product.server");
    await telegram.sendMessage(chatId, await analyticsReport());
    return;
  }
  if (data === "adm:week") {
    await telegram.answerCallback(cb.id);
    const { weeklyOwnerReport } = await import("./product.server");
    await telegram.sendMessage(chatId, await weeklyOwnerReport());
    return;
  }
  if (data === "adm:launch") {
    await telegram.answerCallback(cb.id);
    const { launchPlanText } = await import("./product.server");
    await telegram.sendMessage(chatId, launchPlanText());
    return;
  }
  if (data === "adm:likes") {
    await telegram.answerCallback(cb.id);
    const { sendLikesPanel } = await import("./growth.server");
    await sendLikesPanel(chatId);
    return;
  }
  if (data === "adm:watch") {
    await telegram.answerCallback(cb.id);
    await sendWatch(chatId, fromId);
    return;
  }
  if (data === "adm:jobs") {
    await telegram.answerCallback(cb.id);
    const { listJobs, jobStats } = await import("../jobs/queue.server");
    const counts = await jobStats();
    const jobs = await listJobs(8);
    const lines = jobs.map((j) => `${j.status} · ${j.id.slice(0, 8)}`).join("\n");
    await telegram.sendMessage(
      chatId,
      `المهام\nانتظار ${counts.pending} · شغل ${counts.processing} · فشل ${counts.failed}\n${lines || "لا مهام"}`,
    );
    return;
  }
  if (data === "adm:reports") {
    await telegram.answerCallback(cb.id);
    const rows = await store.listFilterEvents(10);
    const body = rows.map((r) => `${r.tg_id ?? ""} · ${r.reason ?? r.kind}`).join("\n");
    await telegram.sendMessage(chatId, `البلاغات\n${body || "لا بلاغات"}`);
    return;
  }
  if (data === "adm:tickets") {
    await telegram.answerCallback(cb.id);
    const { listFeedback } = await import("./growth.server");
    const rows = await listFeedback(10);
    const body = rows.map((r) => `${r.tg_id} · ${(r.comment ?? "").slice(0, 80)}`).join("\n");
    await telegram.sendMessage(chatId, `تذاكر الدعم\n${body || "لا تذاكر"}`);
    return;
  }

  await telegram.answerCallback(cb.id);
}

export async function sendWatch(chatId: number, _fromId: number) {
  const store = await import("./store.server");
  const [stats, logs, blocked] = await Promise.all([
    store.adminStats(),
    store.listLogs(8),
    store.listFilterEvents(5),
  ]);
  const s = await botSettings();
  const logLines = logs.length
    ? logs
        .map((row) => {
          const status = row.blocked ? "حجب" : row.ok ? "تم" : "فشل";
          return `• ${status} · ${row.platform ?? "—"} · ${(row.url ?? "").slice(0, 48)}`;
        })
        .join("\n")
    : "لا تحميلات بعد.";
  const blockLines = blocked.length
    ? blocked
        .map((row) => `• ${row.kind} · ${(row.evidence ?? row.reason ?? "").slice(0, 80)}`)
        .join("\n")
    : "لا حجب إباحي مسجّل.";
  await telegram.sendMessage(
    chatId,
    `مراقبة برق\nأعضاء ${stats.members} · تحميلات ${stats.downloads} · حجب ${stats.blocked} · فشل ${stats.failed}\nجروك: ${grokReady() ? grokModelLabel(s.grokModel) : "غير متصل"}\n\nآخر التحميلات:\n${logLines}\n\nالحجب:\n${blockLines}`,
    { reply_markup: OWNER_KEYBOARD },
  );
}

export async function runBroadcast(chatId: number, text: string) {
  const { memberIds } = await import("./store.server");
  const ids = await memberIds();
  let sent = 0;
  for (const id of ids) {
    try {
      await telegram.sendMessage(Number(id), text);
      sent += 1;
    } catch {
      /* skip */
    }
  }
  await telegram.sendMessage(chatId, `تم الإرسال إلى ${sent} من ${ids.length}`);
}
