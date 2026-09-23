export function publicStartCaption(opts: { free: number; channel: string; support: string }): string {
  return `برق ⚡️
الصق الرابط، يصلك المقطع بأعلى جودة. بدون قوائم وبدون انتظار.

الموقع
https://abdulrhman.ai
مكتبتك وسجلك وحسابك كلها هناك.

بعد التحميل
لخّصه · كابشن · رابط مؤقت · مشاركة

تنبيه
المحتوى الإباحي و+18 قد يودي للحظر.
نحن براء أمام الله من هذا المحتوى.

التحديثات @${opts.channel || "barq_all"}
الدعم @${opts.support}`;
}
