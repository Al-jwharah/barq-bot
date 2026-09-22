export function publicStartCaption(opts: { free: number; channel: string; support: string }): string {
  return `برق ⚡️ لتحميل الفيديوهات

الصق الرابط ← يصلك الفيديو.
يوتيوب · تيك توك · إنستغرام · إكس · فيسبوك وغيرها.
بعد الرابط: اختر الجودة أو «صوت فقط» عند توفرها.

الدعم @${opts.support}`;
}
