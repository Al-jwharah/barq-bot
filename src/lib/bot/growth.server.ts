import { SUPPORT_URL, SUPPORT_USERNAME } from "./config.server";
import { retentionRates } from "./retention";
import { inlineKeyboard, telegram, type TgBtn } from "./telegram.server";

export type UserGrowth = {
  tg_id: string;
  onboarding_step: number;
  streak: number;
  best_streak: number;
  last_seen_day: string | null;
  last_nudge_day: string | null;
  downloads_ok: number;
  ai_uses: number;
  tips: number;
};

export const ACHIEVEMENTS: Record<string, { title: string; hint: string }> = {
  onboarded: { title: "أول خطوة", hint: "أكمل تجربة أول استخدام" },
  first_dl: { title: "أول برق", hint: "حمّل أول مقطع" },
  dl_5: { title: "خمسة ومضية", hint: "خمسة تحميلات ناجحة" },
  dl_25: { title: "رعد", hint: "٢٥ تحميلًا" },
  streak_3: { title: "ثلاثة أيام", hint: "سلسلة ٣ أيام" },
  streak_7: { title: "أسبوع نور", hint: "سلسلة ٧ أيام" },
  first_ai: { title: "سأل Barq", hint: "أول رسالة لـ Barq AI" },
  supporter: { title: "كوب قهوة", hint: "دعمت المطور" },
  journey_start: { title: "متعلّم", hint: "أنهى رحلة البداية" },
  journey_safe: { title: "أمين", hint: "أنهى رحلة الأمان" },
  journey_ai: { title: "رفيق الذكاء", hint: "أنهى رحلة Barq AI" },
};

export const ONBOARDING = [
  {
    title: "أهلًا في برق ⚡️",
    body: "الصق رابط المقطع ويصلك الملف بأعلى جودة.",
  },
  {
    title: "كيف تحمّل",
    body: "١) انسخ رابط المقطع من أي منصة.\n٢) الصقه هنا.\n٣) يصلك الملف بأعلى جودة.",
  },
  {
    title: "تنبيه",
    body: "المحتوى الإباحي و+18 قد يودي للحظر.\nنحن براء أمام الله من هذا المحتوى.\nإن الله يراك. فاتقوا الله فيما تشاهدون.",
  },
  {
    title: "Barq AI معك",
    body: "اكتب بالعربية: «لخّص الفيديو» أو «اشرح الفكرة».\n١٠ رسائل يوميًا للجميع. بعدها التحميل يبقى متاحًا.",
  },
  {
    title: "مهمتك الأولى",
    body: "أرسل الآن رابط مقطع.\nإن احتجت مساعدة اضغط «رحلتي». الدعم @i_2169",
  },
];

export const JOURNEYS: Record<
  string,
  { title: string; steps: { title: string; body: string }[]; achievement: string }
> = {
  start: {
    title: "رحلة البداية",
    achievement: "journey_start",
    steps: [
      {
        title: "انسخ الرابط لا الملف",
        body: "من زر المشاركة في التطبيق انسخ الرابط. برق يفهم يوتيوب وتيك توك وإنستغرام وإكس وفيسبوك.",
      },
      {
        title: "انتظر الإشارة",
        body: "ترى: استقبال → فحص أمان → تجهيز → رفع. إن فشل نعيد المحاولة تلقائيًا ثلاث مرات.",
      },
      {
        title: "يصلك الملف",
        body: "بعد الرابط يرسل برق أعلى جودة مع الصوت مباشرة.",
      },
    ],
  },
  safe: {
    title: "رحلة الأمان",
    achievement: "journey_safe",
    steps: [
      {
        title: "تنبيه الإباحي",
        body: "المحتوى الإباحي و+18 قد يودي للحظر. نحن براء أمام الله من هذا المحتوى.",
      },
      {
        title: "ماذا ترسل",
        body: "الصق رابط المقطع ويصلك الملف. إن شككت أنه إباحي لا ترسله.",
      },
      {
        title: "تذكير",
        body: "إن الله يراك. فاتقوا الله فيما تشاهدون. الدعم @i_2169",
      },
    ],
  },
  ai: {
    title: "رحلة Barq AI",
    achievement: "journey_ai",
    steps: [
      {
        title: "اكتب كإنسان",
        body: "«لخّص آخر فيديو» أو «حوّل الفكرة إلى تذكير قصير». لا حاجة لأوامر إنجليزية.",
      },
      {
        title: "حد يومي عادل",
        body: "١٠ رسائل لغير المالك. التحميل لا يُخصم من هذا العدد.",
      },
      {
        title: "جرّبه الآن",
        body: "اكتب: رحّب بي بجملة واحدة عن برق. بعدها ارجع للرحلة إن أحببت.",
      },
    ],
  },
};

export function todayStamp(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function nextStreak(
  prevStreak: number,
  lastSeenDay: string | null,
  today: string,
): { streak: number; kind: "first" | "continue" | "same" | "reset" } {
  if (!lastSeenDay) return { streak: 1, kind: "first" };
  if (lastSeenDay === today) return { streak: Math.max(1, prevStreak || 1), kind: "same" };
  const prev = Date.parse(`${lastSeenDay}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  const days = Math.round((now - prev) / 86400000);
  if (days === 1) return { streak: (prevStreak || 0) + 1, kind: "continue" };
  return { streak: 1, kind: "reset" };
}

export function pendingAchievements(stats: {
  onboarding_step: number;
  downloads_ok: number;
  ai_uses: number;
  tips: number;
  streak: number;
  journeys?: string[];
}): string[] {
  const out: string[] = [];
  if (stats.onboarding_step < 0) out.push("onboarded");
  if (stats.downloads_ok >= 1) out.push("first_dl");
  if (stats.downloads_ok >= 5) out.push("dl_5");
  if (stats.downloads_ok >= 25) out.push("dl_25");
  if (stats.streak >= 3) out.push("streak_3");
  if (stats.streak >= 7) out.push("streak_7");
  if (stats.ai_uses >= 1) out.push("first_ai");
  if (stats.tips >= 1) out.push("supporter");
  for (const j of stats.journeys ?? []) {
    if (JOURNEYS[j]) out.push(JOURNEYS[j].achievement);
  }
  return out;
}

async function sqlClient() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

let ensured = false;
async function ensure() {
  if (ensured) return;
  const sql = await sqlClient();
  await sql`
    create table if not exists user_stats (
      tg_id text primary key,
      onboarding_step integer not null default -1,
      streak integer not null default 0,
      best_streak integer not null default 0,
      last_seen_day date,
      last_nudge_day date,
      downloads_ok integer not null default 0,
      ai_uses integer not null default 0,
      tips integer not null default 0,
      created_at timestamptz not null default now()
    )
  `;
  await sql`alter table user_stats add column if not exists daily_dl integer not null default 0`.catch(
    () => undefined,
  );
  await sql`alter table user_stats add column if not exists daily_dl_day date`.catch(() => undefined);
  await sql`
    create table if not exists growth_events (
      id serial primary key,
      tg_id text,
      name text not null,
      props text,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists user_achievements (
      tg_id text not null,
      code text not null,
      unlocked_at timestamptz not null default now(),
      primary key (tg_id, code)
    )
  `;
  await sql`
    create table if not exists user_journeys (
      tg_id text not null,
      journey_id text not null,
      step integer not null default 0,
      completed_at timestamptz,
      primary key (tg_id, journey_id)
    )
  `;
  await sql`
    create table if not exists user_feedback (
      id serial primary key,
      tg_id text,
      rating integer,
      comment text,
      stage text,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists bot_likes (
      tg_id text primary key,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists like_counter (
      id smallint primary key default 1 check (id = 1),
      total integer not null default 0
    )
  `;
  await sql`insert into like_counter (id, total) values (1, 0) on conflict (id) do nothing`;
  ensured = true;
}

function rowStats(r: Record<string, unknown>): UserGrowth {
  return {
    tg_id: String(r.tg_id),
    onboarding_step: Number(r.onboarding_step ?? 0),
    streak: Number(r.streak ?? 0),
    best_streak: Number(r.best_streak ?? 0),
    last_seen_day: r.last_seen_day ? String(r.last_seen_day).slice(0, 10) : null,
    last_nudge_day: r.last_nudge_day ? String(r.last_nudge_day).slice(0, 10) : null,
    downloads_ok: Number(r.downloads_ok ?? 0),
    ai_uses: Number(r.ai_uses ?? 0),
    tips: Number(r.tips ?? 0),
  };
}

export async function track(tgId: number | string | null, name: string, props?: string) {
  try {
    await ensure();
    const sql = await sqlClient();
    await sql`
      insert into growth_events (tg_id, name, props)
      values (${tgId != null ? String(tgId) : null}, ${name}, ${props ?? null})
    `;
  } catch {
    /* ignore */
  }
}

export async function getGrowth(tgId: number | string): Promise<UserGrowth> {
  await ensure();
  const sql = await sqlClient();
  const id = String(tgId);
  await sql`insert into user_stats (tg_id) values (${id}) on conflict (tg_id) do nothing`;
  const rows = await sql<Record<string, unknown>>`select * from user_stats where tg_id = ${id}`;
  return rowStats(rows[0] ?? { tg_id: id });
}

export async function touchSession(tgId: number | string): Promise<UserGrowth & { kind: ReturnType<typeof nextStreak>["kind"] }> {
  const today = todayStamp();
  const cur = await getGrowth(tgId);
  const next = nextStreak(cur.streak, cur.last_seen_day, today);
  const best = Math.max(cur.best_streak, next.streak);
  const sql = await sqlClient();
  await sql`
    update user_stats
    set streak = ${next.streak},
        best_streak = ${best},
        last_seen_day = ${today}::date
    where tg_id = ${String(tgId)}
  `;
  if (next.kind === "continue" || next.kind === "first") {
    await track(tgId, "session", next.kind);
  }
  await unlockDue({ ...cur, streak: next.streak }, tgId);
  return { ...cur, streak: next.streak, best_streak: best, last_seen_day: today, kind: next.kind };
}

async function ownedCodes(tgId: number | string): Promise<Set<string>> {
  const sql = await sqlClient();
  const rows = await sql<{ code: string }>`select code from user_achievements where tg_id = ${String(tgId)}`;
  return new Set(rows.map((r) => r.code));
}

async function completedJourneys(tgId: number | string): Promise<string[]> {
  const sql = await sqlClient();
  const rows = await sql<{ journey_id: string }>`
    select journey_id from user_journeys
    where tg_id = ${String(tgId)} and completed_at is not null
  `;
  return rows.map((r) => r.journey_id);
}

export async function unlockDue(stats: UserGrowth, tgId: number | string, chatId?: number) {
  const have = await ownedCodes(tgId);
  const journeys = await completedJourneys(tgId).catch(() => [] as string[]);
  const pending = pendingAchievements({ ...stats, journeys }).filter((c) => !have.has(c));
  if (!pending.length) return [];
  const sql = await sqlClient();
  const unlocked: string[] = [];
  for (const code of pending) {
    try {
      await sql`
        insert into user_achievements (tg_id, code) values (${String(tgId)}, ${code})
      `;
      unlocked.push(code);
      await track(tgId, "achievement", code);
    } catch {
      /* already */
    }
  }
  if (chatId && unlocked.length) {
    const lines = unlocked.map((c) => `🏅 ${ACHIEVEMENTS[c]?.title ?? c}`).join("\n");
    await telegram
      .sendMessage(chatId, `إنجاز جديد\n${lines}`)
      .catch(() => undefined);
  }
  return unlocked;
}

export async function bumpDownloadOk(tgId: number | string, chatId?: number) {
  const sql = await sqlClient();
  await ensure();
  await sql`
    insert into user_stats (tg_id, downloads_ok) values (${String(tgId)}, 1)
    on conflict (tg_id) do update set downloads_ok = user_stats.downloads_ok + 1
  `;
  await track(tgId, "download_ok");
  const stats = await getGrowth(tgId);
  await unlockDue(stats, tgId, chatId);
}

export async function bumpAi(tgId: number | string, chatId: number) {
  const sql = await sqlClient();
  await ensure();
  await sql`
    insert into user_stats (tg_id, ai_uses) values (${String(tgId)}, 1)
    on conflict (tg_id) do update set ai_uses = user_stats.ai_uses + 1
  `;
  await track(tgId, "ai");
  const stats = await getGrowth(tgId);
  await unlockDue(stats, tgId, chatId);
}

export async function bumpTip(tgId: number | string, chatId: number) {
  const sql = await sqlClient();
  await ensure();
  await sql`
    insert into user_stats (tg_id, tips) values (${String(tgId)}, 1)
    on conflict (tg_id) do update set tips = user_stats.tips + 1
  `;
  await track(tgId, "tip");
  const stats = await getGrowth(tgId);
  await unlockDue(stats, tgId, chatId);
}

function onboardingMarkup(step: number) {
  const last = ONBOARDING.length - 1;
  const rows: TgBtn[][] = [];
  if (step < last) {
    rows.push([{ text: "التالي ⚡️", callback_data: `gx:on:${step + 1}` }]);
    rows.push([{ text: "تخطّي", callback_data: "gx:on:skip" }]);
  } else {
    rows.push([{ text: "ابدأ التحميل", callback_data: "gx:on:done" }]);
    rows.push([{ text: "افتح رحلة البداية", callback_data: "gx:j:start:0" }]);
  }
  return inlineKeyboard(rows);
}

export async function sendOnboarding(chatId: number, tgId: number | string, step = 0) {
  const i = Math.max(0, Math.min(step, ONBOARDING.length - 1));
  const card = ONBOARDING[i]!;
  const sql = await sqlClient();
  await ensure();
  await sql`update user_stats set onboarding_step = ${i} where tg_id = ${String(tgId)}`;
  await track(tgId, "onboarding", String(i));
  await telegram.sendMessage(
    chatId,
    `${card.title}\n\n${card.body}\n\n${i + 1}/${ONBOARDING.length}`,
    { reply_markup: onboardingMarkup(i) },
  );
}

export async function finishOnboarding(chatId: number, tgId: number | string) {
  const sql = await sqlClient();
  await ensure();
  await sql`update user_stats set onboarding_step = -1 where tg_id = ${String(tgId)}`;
  await track(tgId, "onboarding_done");
  const stats = await getGrowth(tgId);
  await unlockDue({ ...stats, onboarding_step: -1 }, tgId, chatId);
  await telegram.sendMessage(
    chatId,
    `صرت جاهزًا ⚡️\nالصق رابطًا أو اكتب لـ Barq AI.\nالدعم @${SUPPORT_USERNAME}`,
  );
}

function journeyMarkup(id: string, step: number, last: number) {
  const rows: TgBtn[][] = [];
  if (step < last) rows.push([{ text: "الدرس التالي", callback_data: `gx:j:${id}:${step + 1}` }]);
  else rows.push([{ text: "أتممت الرحلة", callback_data: `gx:j:${id}:done` }]);
  rows.push([{ text: "كل الرحلات", callback_data: "gx:j:list" }]);
  return inlineKeyboard(rows);
}

export async function sendJourneyList(chatId: number, tgId: number | string) {
  const done = new Set(await completedJourneys(tgId).catch(() => [] as string[]));
  const lines = Object.entries(JOURNEYS)
    .map(([id, j]) => `${done.has(id) ? "✅" : "▫️"} ${j.title}`)
    .join("\n");
  await telegram.sendMessage(chatId, `رحلات برق التعليمية\n\n${lines}\n\nاختر رحلة قصيرة (٣ دروس).`, {
    reply_markup: inlineKeyboard([
      [{ text: "رحلة البداية", callback_data: "gx:j:start:0" }],
      [{ text: "رحلة الأمان", callback_data: "gx:j:safe:0" }],
      [{ text: "رحلة Barq AI", callback_data: "gx:j:ai:0" }],
    ]),
  });
}

export async function sendJourneyStep(chatId: number, tgId: number | string, id: string, step: number) {
  const journey = JOURNEYS[id];
  if (!journey) {
    await sendJourneyList(chatId, tgId);
    return;
  }
  await ensure();
  const sql = await sqlClient();
  await sql`
    insert into user_journeys (tg_id, journey_id, step)
    values (${String(tgId)}, ${id}, ${step})
    on conflict (tg_id, journey_id) do update set step = excluded.step
  `;
  await track(tgId, "journey", `${id}:${step}`);
  const card = journey.steps[Math.min(step, journey.steps.length - 1)]!;
  await telegram.sendMessage(
    chatId,
    `${journey.title}\n${card.title}\n\n${card.body}\n\n${step + 1}/${journey.steps.length}`,
    { reply_markup: journeyMarkup(id, step, journey.steps.length - 1) },
  );
}

export async function completeJourney(chatId: number, tgId: number | string, id: string) {
  const journey = JOURNEYS[id];
  if (!journey) return;
  await ensure();
  const sql = await sqlClient();
  await sql`
    insert into user_journeys (tg_id, journey_id, step, completed_at)
    values (${String(tgId)}, ${id}, ${JOURNEYS[id]!.steps.length}, now())
    on conflict (tg_id, journey_id) do update set completed_at = now(), step = excluded.step
  `;
  await track(tgId, "journey_done", id);
  const stats = await getGrowth(tgId);
  await unlockDue(stats, tgId, chatId);
  await telegram.sendMessage(chatId, `أحسنت. أنهيت «${journey.title}».`);
}

export async function sendAchievements(chatId: number, tgId: number | string) {
  const stats = await getGrowth(tgId);
  const have = await ownedCodes(tgId);
  const lines = Object.entries(ACHIEVEMENTS)
    .map(([code, meta]) => `${have.has(code) ? "✅" : "▫️"} ${meta.title} — ${meta.hint}`)
    .join("\n");
  await telegram.sendMessage(
    chatId,
    `إنجازاتك ⚡️\nالسلسلة: ${stats.streak} يوم (أفضل ${stats.best_streak})\nتحميلات: ${stats.downloads_ok}\n\n${lines}`,
  );
}

export async function sendFeedbackAsk(chatId: number) {
  const likes = await likeCount();
  await telegram.sendMessage(chatId, "برق ⚡️", {
    reply_markup: likeAskKeyboard(likes),
  });
}

export function likeButtonLabel(count: number): string {
  return `⚡️ أعجبني · ${Math.max(0, count)}`;
}

export function likesPanelText(count: number, recent: { tg_id: string; created_at: string }[] = []): string {
  const lines = recent.slice(0, 12).map((row, i) => `${i + 1}. ${row.tg_id} · ${stampAr(row.created_at)}`);
  return [
    "لوحة الإعجاب ⚡️",
    "",
    `العدد المخزّن: ${Math.max(0, count)}`,
    "يُحفظ في قاعدة البيانات ويظهر فور الضغط.",
    lines.length ? `\nآخر المعجبين:\n${lines.join("\n")}` : "\nلا إعجابات بعد. كن أول من يضغط.",
  ].join("\n");
}

function stampAr(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 16);
  return d.toLocaleString("ar-SA", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
}

export function likeAskKeyboard(count: number) {
  return inlineKeyboard([
    [
      { text: likeButtonLabel(count), callback_data: "gx:like" },
      { text: "ما أعجبني", callback_data: "gx:nope" },
    ],
    [{ text: "لوحة الإعجاب", callback_data: "gx:likes" }],
  ]);
}

export function likesPanelKeyboard(count: number) {
  return inlineKeyboard([
    [{ text: likeButtonLabel(count), callback_data: "gx:like" }],
    [
      { text: "تحديث العدد", callback_data: "gx:likes:refresh" },
      { text: "لوحة الإعجاب", callback_data: "gx:likes" },
    ],
  ]);
}

export async function likeCount(): Promise<number> {
  await ensure();
  const sql = await sqlClient();
  const stored = await sql<{ total: number }>`select total from like_counter where id = 1`.catch(() => []);
  if (stored[0] && Number.isFinite(Number(stored[0].total))) return Math.max(0, Number(stored[0].total));
  const rows = await sql<{ c: number }>`select count(*)::int as c from bot_likes`.catch(() => [{ c: 0 }]);
  return Number(rows[0]?.c ?? 0);
}

export async function listRecentLikes(limit = 12): Promise<{ tg_id: string; created_at: string }[]> {
  await ensure();
  const sql = await sqlClient();
  const rows = await sql<{ tg_id: string; created_at: string }>`
    select tg_id, created_at::text as created_at
    from bot_likes
    order by created_at desc
    limit ${limit}
  `.catch(() => []);
  return rows.map((r) => ({ tg_id: String(r.tg_id), created_at: String(r.created_at) }));
}

export async function addLike(tgId: number | string): Promise<{ added: boolean; likes: number }> {
  await ensure();
  const id = String(tgId).trim();
  if (!id) return { added: false, likes: await likeCount() };
  const { withBotTx } = await import("./tx.server");
  const result = await withBotTx(async (sql) => {
    await sql`insert into like_counter (id, total) values (1, 0) on conflict (id) do nothing`;
    const inserted = await sql<{ tg_id: string }>`
      insert into bot_likes (tg_id) values (${id})
      on conflict (tg_id) do nothing
      returning tg_id
    `;
    if (inserted[0]) {
      const rows = await sql<{ total: number }>`
        update like_counter set total = total + 1 where id = 1 returning total
      `;
      return { added: true, likes: Number(rows[0]?.total ?? 0) };
    }
    const rows = await sql<{ total: number }>`select total from like_counter where id = 1`;
    return { added: false, likes: Number(rows[0]?.total ?? 0) };
  });
  if (result.added) await track(tgId, "like", "barq").catch(() => undefined);
  return result;
}

export type GrowthCbCtx = { callbackId?: string; messageId?: number };

export async function sendLikesPanel(chatId: number, messageId?: number) {
  const likes = await likeCount();
  const recent = await listRecentLikes(12);
  const text = likesPanelText(likes, recent);
  const markup = likesPanelKeyboard(likes);
  if (messageId) {
    await telegram
      .editMessageText(chatId, messageId, text, { reply_markup: markup })
      .catch(async () => {
        await telegram.sendMessage(chatId, text, { reply_markup: markup });
      });
    return;
  }
  await telegram.sendMessage(chatId, text, { reply_markup: markup });
}

export async function handleLike(chatId: number, tgId: number, ctx: GrowthCbCtx = {}) {
  const result = await addLike(tgId);
  const toast = result.added
    ? `تسجّل إعجابك · المعجبون ${result.likes}`
    : `إعجابك مسجّل · المعجبون ${result.likes}`;
  if (ctx.callbackId) await telegram.answerCallback(ctx.callbackId, toast);
  const recent = await listRecentLikes(12);
  const text = likesPanelText(result.likes, recent);
  const markup = likesPanelKeyboard(result.likes);
  if (ctx.messageId) {
    await telegram
      .editMessageText(chatId, ctx.messageId, text, { reply_markup: markup })
      .catch(async () => {
        await telegram.editMessageReplyMarkup(chatId, ctx.messageId!, markup).catch(() => undefined);
        await telegram.sendMessage(chatId, toast, { reply_markup: markup });
      });
    return;
  }
  await telegram.sendMessage(chatId, text, { reply_markup: markup });
}

export async function handleDislike(chatId: number, tgId: number) {
  await saveFeedback({ tgId, rating: 1, stage: "dislike" });
  const { awaitMap } = await import("./session.server");
  awaitMap().set(tgId, "feedback");
  await telegram.sendMessage(
    chatId,
    `آسفين. اكتب ملاحظتك هنا بجملة واحدة، أو راسل الدعم @${SUPPORT_USERNAME}`,
    {
      reply_markup: inlineKeyboard([[{ text: "الدعم الفني", url: SUPPORT_URL }]]),
    },
  );
}

export async function saveFeedback(input: {
  tgId: number | string;
  rating?: number;
  comment?: string;
  stage?: string;
}) {
  await ensure();
  const sql = await sqlClient();
  await sql`
    insert into user_feedback (tg_id, rating, comment, stage)
    values (
      ${String(input.tgId)},
      ${input.rating ?? null},
      ${input.comment ?? null},
      ${input.stage ?? "download"}
    )
  `;
  await track(input.tgId, "feedback", String(input.rating ?? input.comment ?? ""));
}

export async function listFeedback(limit = 40) {
  await ensure();
  const sql = await sqlClient();
  try {
    return await sql<{
      id: number;
      tg_id: string;
      rating: number | null;
      comment: string | null;
      stage: string | null;
      created_at: string;
    }>`select id, tg_id, rating, comment, stage, created_at from user_feedback order by id desc limit ${limit}`;
  } catch {
    return [];
  }
}

export async function handleFeedbackRating(chatId: number, tgId: number, rating: number) {
  await saveFeedback({ tgId, rating, stage: "download" });
  if (rating <= 3) {
    const { awaitMap } = await import("./session.server");
    awaitMap().set(tgId, "feedback");
    await telegram.sendMessage(chatId, "مؤسف. اكتب المشكلة بجملة واحدة.");
    return;
  }
  await telegram.sendMessage(chatId, "شكرًا. هذا يساعدنا نحسّن برق.");
}

export async function handleGrowthCallback(
  chatId: number,
  tgId: number,
  data: string,
  ctx: GrowthCbCtx = {},
): Promise<boolean> {
  if (!data.startsWith("gx:")) return false;
  if (data === "gx:like") {
    await handleLike(chatId, Number(tgId), ctx);
    return true;
  }
  if (data === "gx:likes" || data === "gx:likes:refresh") {
    if (ctx.callbackId) await telegram.answerCallback(ctx.callbackId, "تم تحديث العدد");
    await sendLikesPanel(chatId, ctx.messageId);
    return true;
  }
  if (ctx.callbackId) await telegram.answerCallback(ctx.callbackId);
  if (data.startsWith("gx:on:")) {
    const rest = data.slice(6);
    if (rest === "skip" || rest === "done") {
      await finishOnboarding(chatId, tgId);
      return true;
    }
    const step = Number(rest);
    if (Number.isFinite(step)) await sendOnboarding(chatId, tgId, step);
    return true;
  }
  if (data === "gx:j:list" || data === "gx:journeys") {
    await sendJourneyList(chatId, tgId);
    return true;
  }
  if (data === "gx:ach") {
    await sendAchievements(chatId, tgId);
    return true;
  }
  if (data === "gx:fb:ask") {
    await sendFeedbackAsk(chatId);
    return true;
  }
  if (data === "gx:nope") {
    await handleDislike(chatId, Number(tgId));
    return true;
  }
  if (data.startsWith("gx:fb:")) {
    const rating = Number(data.slice(6));
    if (rating >= 1 && rating <= 5) await handleFeedbackRating(chatId, Number(tgId), rating);
    return true;
  }
  const m = data.match(/^gx:j:([a-z]+):(\d+|done)$/);
  if (m) {
    const id = m[1]!;
    if (m[2] === "done") await completeJourney(chatId, tgId, id);
    else await sendJourneyStep(chatId, tgId, id, Number(m[2]));
    return true;
  }
  return false;
}

export async function analyticsSnapshot() {
  await ensure();
  const sql = await sqlClient();
  const dau = await sql<{ c: number }>`
    select count(*)::int as c from user_stats where last_seen_day = current_date
  `;
  const wau = await sql<{ c: number }>`
    select count(*)::int as c from user_stats where last_seen_day >= current_date - 6
  `;
  const neu = await sql<{ c: number }>`
    select count(*)::int as c from user_stats where created_at::date = current_date
  `;
  const onboarded = await sql<{ c: number }>`
    select count(*)::int as c from user_stats where onboarding_step < 0
  `;
  const total = await sql<{ c: number }>`select count(*)::int as c from user_stats`;
  const streaks = await sql<{ c: number }>`
    select count(*)::int as c from user_stats where streak >= 3
  `;
  const events = await sql<{ name: string; c: number }>`
    select name, count(*)::int as c from growth_events
    where created_at > now() - interval '7 days'
    group by name order by c desc limit 12
  `;
  const unlocks = await sql<{ code: string; c: number }>`
    select code, count(*)::int as c from user_achievements group by code order by c desc
  `;
  const cohort = await sql<{ created: string; last_seen_day: string | null }>`
    select created_at::text as created, last_seen_day::text as last_seen_day from user_stats
  `;
  const retention = retentionRates(
    cohort.map((u) => ({ created: String(u.created), lastSeen: u.last_seen_day })),
    todayStamp(),
  );
  const fb = await sql<{ c: number; avg: number | null }>`
    select count(*)::int as c, avg(rating)::float as avg from user_feedback where rating is not null
  `.catch(() => [{ c: 0, avg: null }]);
  const likes = await likeCount();
  const t = Number(total[0]?.c ?? 0);
  return {
    dau: Number(dau[0]?.c ?? 0),
    wau: Number(wau[0]?.c ?? 0),
    newToday: Number(neu[0]?.c ?? 0),
    onboarded: Number(onboarded[0]?.c ?? 0),
    onboardPct: t ? Math.round((Number(onboarded[0]?.c ?? 0) / t) * 100) : 0,
    streak3: Number(streaks[0]?.c ?? 0),
    users: t,
    events,
    unlocks,
    retention,
    likes,
    feedback: { count: Number(fb[0]?.c ?? 0), avg: fb[0]?.avg != null ? Math.round(Number(fb[0].avg) * 10) / 10 : 0 },
  };
}

export async function sendComebacks(limit = 25) {
  await ensure();
  const sql = await sqlClient();
  const today = todayStamp();
  const rows = await sql<{ tg_id: string; streak: number }>`
    select tg_id, streak from user_stats
    where last_seen_day is not null
      and last_seen_day <= current_date - 2
      and last_seen_day >= current_date - 7
      and (last_nudge_day is null or last_nudge_day < current_date)
    order by last_seen_day desc
    limit ${limit}
  `;
  const NUDGE_LINES = [
    "برق ⚡️ الصق الرابط إذا عندك مقطع.",
    "الموقع جاهز للمقطع الكبير: abdulrhman.ai",
    "لخّصه وكابشن تحت آخر مقطع.",
  ];
  let sent = 0;
  for (const r of rows) {
    try {
      const line = NUDGE_LINES[Math.floor(Math.random() * NUDGE_LINES.length)]!;
      await telegram.sendMessage(Number(r.tg_id), line);
      await sql`update user_stats set last_nudge_day = ${today}::date where tg_id = ${r.tg_id}`;
      await track(r.tg_id, "nudge");
      sent += 1;
    } catch {
      /* blocked */
    }
  }
  return sent;
}

export async function runComebacks(force = false): Promise<{ sent: number; skipped?: string }> {
  const { getSettings, setSetting } = await import("./store.server");
  if (!force) {
    const last = Date.parse((await getSettings()).last_comeback_run || "");
    if (Number.isFinite(last) && Date.now() - last < 3 * 60 * 60 * 1000) {
      return { sent: 0, skipped: "wait" };
    }
  }
  const sent = await sendComebacks(30);
  await setSetting("last_comeback_run", new Date().toISOString());
  return { sent };
}
