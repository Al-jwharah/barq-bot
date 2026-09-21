import {
  DISCOUNT_CODE,
  DISCOUNT_DAYS,
  DISCOUNT_USES,
  OWNER_TG_ID,
  TEMP_FREE,
  isOwnerId,
} from "./config.server";
import { createCode, ensurePaidGiftCodes, listFreeMemberIds, setSetting } from "./store.server";
import { telegram } from "./telegram.server";

const HOUR_MS = 55 * 60 * 1000;

const FUNNY = [
  {
    caption:
      "الجدد يدورون على «موقع تحميل فيديوهات 2026» خمس دقايق… وأنت لصقت الرابط في برق وخلصت.",
    gif: "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif",
  },
  {
    caption:
      "عرض برق: قطعة واحدة تكفي. إلا إنك بترجع للرابط الثاني مثل كنتاكي بعد منتصف الليل.",
    gif: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  },
  {
    caption: "تحسب التحميل علم صواريخ. برق: الصق. استلم. اذكر الله.",
    gif: "https://media.giphy.com/media/5VKbvrjkmVebC/giphy.gif",
  },
  {
    caption: "اللي يحمّل من عشرة مواقع ثم يكتشف برق… نفس اللي يكتشف الواي فاي بعد ما خلص الباقة.",
    gif: "https://media.giphy.com/media/13HgwGsXF0aiGY/giphy.gif",
  },
];

export async function maybeFunnyAd(chatId: number, fromId: number): Promise<void> {
  if (isOwnerId(fromId)) return;
  if (Math.random() > 0.28) return;
  const ad = FUNNY[Math.floor(Date.now() / 7000) % FUNNY.length]!;
  try {
    await telegram.sendAnimationUrl(chatId, ad.gif, { caption: ad.caption });
  } catch {
    await telegram.sendMessage(chatId, ad.caption).catch(() => undefined);
  }
}

export async function ensureDiscountCode() {
  await createCode(DISCOUNT_CODE, DISCOUNT_DAYS, DISCOUNT_USES);
  await ensurePaidGiftCodes().catch(() => undefined);
}

export async function runHourlyAds(force = false): Promise<{ sent: number; skipped?: string }> {
  if (TEMP_FREE) return { sent: 0, skipped: "temp-free" };
  const { getSettings } = await import("./store.server");
  const raw = await getSettings();
  if (raw.hourly_ads === "off") return { sent: 0, skipped: "off" };
  const last = Date.parse(raw.last_hourly_ad || "");
  if (!force && Number.isFinite(last) && Date.now() - last < HOUR_MS) {
    return { sent: 0, skipped: "wait" };
  }
  await ensureDiscountCode();
  const ids = (await listFreeMemberIds()).filter((id) => id !== OWNER_TG_ID);
  if (!ids.length) {
    await setSetting("last_hourly_ad", new Date().toISOString());
    return { sent: 0, skipped: "none" };
  }
  const ad = FUNNY[Math.floor(Date.now() / 3_600_000) % FUNNY.length]!;
  let sent = 0;
  for (const id of ids.slice(0, 200)) {
    try {
      await telegram.sendMessage(Number(id), ad.caption);
      sent += 1;
    } catch {
      /* skip */
    }
  }
  await setSetting("last_hourly_ad", new Date().toISOString());
  return { sent };
}
