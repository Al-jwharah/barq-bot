import { workersForLoad } from "./queue-priority";
import { grokReady } from "./grok.server";
import { LAUNCH_MAX, MAINTENANCE, OWNER_TG_ID, SUBSCRIPTIONS_LIVE, TEMP_FREE } from "./config.server";
import { jobStats, type JobCounts } from "../jobs/queue.server";
import { telegram } from "./telegram.server";
import { getSettings, setSetting } from "./store.server";

function emptyQueue(): JobCounts {
  return {
    pending: 0,
    processing: 0,
    uploading: 0,
    failed: 0,
    completed: 0,
    cancelled: 0,
    expired: 0,
    avgSeconds: 0,
    failedToday: 0,
    oldestProcessingSeconds: 0,
  };
}

export async function storageStats() {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const members = await sql<{ c: number }>`select count(*)::int as c from members`.catch(() => [{ c: 0 }]);
  const jobs = await sql<{ c: number }>`select count(*)::int as c from download_jobs`.catch(() => [{ c: 0 }]);
  const logs = await sql<{ c: number }>`select count(*)::int as c from download_logs`.catch(() => [{ c: 0 }]);
  const clips = await sql<{ c: number }>`select count(*)::int as c from clips`.catch(() => [{ c: 0 }]);
  const events = await sql<{ c: number }>`select count(*)::int as c from growth_events`.catch(() => [{ c: 0 }]);
  const feedback = await sql<{ c: number }>`select count(*)::int as c from user_feedback`.catch(() => [{ c: 0 }]);
  const counts = {
    members: Number(members[0]?.c ?? 0),
    download_jobs: Number(jobs[0]?.c ?? 0),
    download_logs: Number(logs[0]?.c ?? 0),
    clips: Number(clips[0]?.c ?? 0),
    growth_events: Number(events[0]?.c ?? 0),
    user_feedback: Number(feedback[0]?.c ?? 0),
  };
  const rows = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    blob: Boolean(typeof process !== "undefined" && process.env.BLOB_READ_WRITE_TOKEN?.trim()),
    rows,
    counts,
  };
}

export async function systemStatusText(): Promise<string> {
  const q = await jobStats().catch(emptyQueue);
  const storage = await storageStats().catch(() => ({ blob: false, rows: 0, counts: {} as Record<string, number> }));
  const download = MAINTENANCE
    ? "🟡 تحت تطوير — التحميل متوقف مؤقتًا"
    : q.failedToday > 5
      ? "🟡 أخطاء اليوم مرتفعة"
      : "🟢 التحميل: يعمل";
  const ai = grokReady() ? "🟢 الذكاء الاصطناعي: يعمل" : "🟡 الذكاء الاصطناعي: غير جاهز";
  const store = storage.blob ? "🟢 التخزين: Blob جاهز" : "🟡 التخزين: بلا Blob";
  const mem = process.memoryUsage();
  const rss = Math.round(mem.rss / 1024 / 1024);
  const heap = Math.round(mem.heapUsed / 1024 / 1024);
  const workers = workersForLoad(q.pending);
  const queue = `مدير الطابور: ${q.pending} انتظار · ${q.processing + q.uploading} جاري · عمال ${workers}\nحد 80 · أقدم جاري ${Math.round(q.oldestProcessingSeconds)}ث`;
  const avg = q.avgSeconds ? `متوسط التحميل: ${Math.round(q.avgSeconds)} ث` : "متوسط التحميل: —";
  const monitor = `الذاكرة: RSS ${rss}MB · Heap ${heap}MB`;
  return `⚡ حالة برق

${download}
${ai}
${store}
🟢 يوتيوب / تيك توك / إنستغرام / إكس

${queue}
${avg}
${monitor}
سجلات تقريبية: ${storage.rows}
إطلاق محدود: حتى ${LAUNCH_MAX} مستخدم
${TEMP_FREE ? "الوضع: مجاني مؤقتًا" : "الوضع: باقات"}
اشتراكات: بلس 4.99 ر.س / ماكس 19.99 ر.س — ${SUBSCRIPTIONS_LIVE && !TEMP_FREE ? "مفعّلة" : "جاهزة غير مفعّلة"}`;
}

export async function sendSystemStatus(chatId: number) {
  const { likeCount, likeAskKeyboard } = await import("./growth.server");
  const likes = await likeCount().catch(() => 0);
  await telegram.sendMessage(chatId, await systemStatusText(), {
    reply_markup: likeAskKeyboard(likes),
  });
}

export async function runOpsAlerts() {
  const q = await jobStats().catch(emptyQueue);
  const alerts: string[] = [];
  if (q.pending >= 5) alerts.push(`عامل متأخر: ${q.pending} في الانتظار`);
  if (q.oldestProcessingSeconds >= 180) {
    alerts.push(`عامل متوقف: مهمة جارية منذ ${Math.round(q.oldestProcessingSeconds / 60)} د`);
  }
  if (q.failedToday >= 3) alerts.push(`أخطاء اليوم: ${q.failedToday} وظيفة فاشلة`);
  if (!alerts.length) return { sent: false, alerts: [] as string[] };
  const last = (await getSettings())["ops_alert_at"];
  const now = Date.now();
  if (last && now - Number(last) < 30 * 60_000) return { sent: false, alerts };
  await setSetting("ops_alert_at", String(now));
  await telegram.sendMessage(
    Number(OWNER_TG_ID),
    `تنبيه تشغيل برق ⚡️\n${alerts.join("\n")}\nمتوسط ${q.avgSeconds}ث · انتظار ${q.pending}`,
  );
  return { sent: true, alerts };
}
