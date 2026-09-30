import { BARQ_AI_BRAND } from "./ai/copy";

export function publicStartCaption(_opts: { free: number; channel: string; support: string }): string {
  return `⚡ هلا! أنا برق

الصق رابط أي فيديو، ويرجع لك الملف هنا في المحادثة.

✂️ تقصّه · 📣 تجهّزه للنشر · 🔖 تحفظه
🤖 ${BARQ_AI_BRAND}: لخّصه · كابشن

🔗 رابط مؤقت مسار ثاني: ترسل ملفًا وتختار 12 أو 24 ساعة.

مجاني. حد تليجرام حوالي 50 ميغا.`;
}

export const HELP_TEXT = `❔ المساعدة

أرسل الرابط مباشرة. ما تحتاج تختار منصة.
أقدر أستلم أكثر من رابط في رسالة واحدة.

تحت الملف
✂️ قصّ — أرسل المدى مثل 00:12-00:35
📣 جهّزه للنشر — مسودة من العنوان والرابط، راجعها قبل النشر
🔖 احفظ — يرجّع الملف من محفوظاتي
↗️ مشاركة — مشاركة الرابط
🤖 برق AI — لخّصه · كابشن من الأزرار

🔗 رابط مؤقت — مسار منفصل: أرسل ملفًا، ثم اختر 12 ساعة أو 24 ساعة.

الدعم @i_2169`;

export function helpCaption(opts: { free?: number; support: string; channel?: string }): string {
  const free = opts.free && opts.free > 0 ? opts.free : 10;
  const channel = opts.channel?.trim();
  return `كيف يعمل برق ⚡️

١) انسخ الرابط من يوتيوب / تيك توك / إنستغرام / إكس / فيسبوك
٢) الصقه هنا
٣) اختر الجودة أو «صوت فقط» إن ظهرت — أو يصلك أفضل جودة متاحة

المجاني: ${free} تحميلات يوميًا.
بعد التسليم يمكنك:
• «لخّصه» / كابشن / ترجمة عبر «${BARQ_AI_BRAND}»
• «رابط مؤقت» لمشاركة المقطع (عند توفر التخزين)

${channel ? `التحديثات: @${channel}\n` : ""}الدعم @${opts.support}`;
}

export function emptyStateNoClipAr(): string {
  return "ما عندك مقطع جاهز بعد. الصق رابطًا أولًا، وبعد التسليم تظهر أدوات «برق AI» و«رابط مؤقت».";
}

export function emptyStateGenericAr(): string {
  return "الصق رابط فيديو للبدء. يوتيوب · تيك توك · إنستغرام · إكس · فيسبوك.";
}

export function postDownloadKeyboardHintAr(): string {
  return "تم التسليم ⚡️ — جاهز للمشاركة أو «برق AI».";
}

export function shortLinkCreatedAr(url: string, platformAr?: string): string {
  const src = platformAr ? `المصدر: ${platformAr}\n` : "";
  return `${src}رابط مباشر لمدة 24 ساعة\n${url}`;
}

export function shortLinkNeedMediaAr(): string {
  return "أرسل رابطًا أو فيديو أو صورة أو ملفًا، ثم اضغط «رابط مؤقت».";
}

export function shortLinkBlobDownAr(): string {
  return "تعذر إنشاء الرابط المختصر (التخزين معلّق مؤقتًا). جرّب لاحقًا أو استخدم رابط المنصة مباشرة.";
}

export { BARQ_AI_BRAND };
