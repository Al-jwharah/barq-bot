import { BARQ_AI_BRAND } from "./ai/copy";

/** Premium Saudi Arabic /start — never Grok/xAI names. */
export function publicStartCaption(opts: { free: number; channel: string; support: string }): string {
  const free = opts.free > 0 ? opts.free : 10;
  const channel = opts.channel?.trim();
  return `برق ⚡️ — حمّل بأي منصة خلال ثوانٍ

الصق الرابط هنا ← يوصلك الفيديو جاهزًا.
يوتيوب · تيك توك · إنستغرام · إكس · فيسبوك

المجاني: ${free} تحميلات كل يوم (توقيت الرياض).
بعد التسليم: «${BARQ_AI_BRAND}» يلخّص · كابشن · ترجمة.

${channel ? `التحديثات: @${channel}\n` : ""}الدعم @${opts.support}`;
}

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
