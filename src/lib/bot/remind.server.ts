import { CHANNEL_CHAT } from "./config.server";
import { getSettings, setSetting } from "./store.server";
import { telegram } from "./telegram.server";

const LINES = [
  { kind: "آية", text: "﴿وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا﴾", src: "الطلاق: ٢" },
  { kind: "حديث", text: "«إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى»", src: "البخاري" },
  { kind: "آية", text: "﴿فَإِنَّ مَعَ الْعُسْرِ يُسْرًا﴾", src: "الشرح: ٦" },
  { kind: "حديث", text: "«المسلم من سلم المسلمون من لسانه ويده»", src: "البخاري ومسلم" },
  { kind: "آية", text: "﴿أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ﴾", src: "الرعد: ٢٨" },
  { kind: "حديث", text: "«لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه»", src: "البخاري ومسلم" },
  { kind: "آية", text: "﴿وَقُل رَّبِّ زِدْنِي عِلْمًا﴾", src: "طه: ١١٤" },
  { kind: "حديث", text: "«من كان يؤمن بالله واليوم الآخر فليقل خيرًا أو ليصمت»", src: "البخاري ومسلم" },
  { kind: "آية", text: "﴿إِنَّ اللَّهَ مَعَ الصَّابِرِينَ﴾", src: "البقرة: ١٥٣" },
  { kind: "حديث", text: "«اتق الله حيثما كنت»", src: "الترمذي" },
];

function slotNow(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

export function reminderText(at = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "2-digit", hourCycle: "h23" }).format(at),
  );
  const line = LINES[Math.abs(hour) % LINES.length]!;
  return `برق ⚡️\n\n${line.kind}\n${line.text}\n\n${line.src}`;
}

export async function maybeHourlyReminder(): Promise<boolean> {
  const slot = slotNow();
  const saved = (await getSettings().catch(() => ({}) as Record<string, string>)).reminder_slot;
  if (saved === slot) return false;
  await setSetting("reminder_slot", slot);
  await telegram.sendMessage(CHANNEL_CHAT, reminderText()).catch(() => undefined);
  return true;
}
