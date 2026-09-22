import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteNav } from "@/components/site/site-nav";

const FAQS = [
    { q: 'هل يمكن تحميل Shorts؟', a: 'نعم، روابط Shorts مدعومة كفيديو عادي.' },
    { q: 'لماذا يرفض رابط القناة؟', a: 'القناة ليست مقطعًا. أرسل رابط watch أو youtu.be لمقطع محدد.' },
    { q: 'هل يوجد حد للحجم؟', a: 'نعم حسب حدود تليجرام والسحابة المعروضة في البوت.' }
] as const;

const STEPS = [
    'انسخ رابط المقطع (ليس رابط القناة).',
    'الصقه في برق أو @barq_ibot.',
    'اختر الجودة أو MP3 واستلم الملف.'
] as const;

export const Route = createFileRoute("/youtube")({
  head: () => ({
    meta: [
      { title: 'تحميل فيديو يوتيوب إلى تليجرام | برق ⚡️' },
      { name: "description", content: 'حمّل فيديو يوتيوب Shorts والأصل و MP3 عبر بوت برق. الصق الرابط على الموقع أو تليجرام واختر الجودة.' },
      { name: "keywords", content: 'تحميل يوتيوب, تحميل youtube تليجرام, يوتيوب mp3, برق بوت, shorts' },
      { property: "og:title", content: 'تحميل فيديو يوتيوب إلى تليجرام | برق ⚡️' },
      { property: "og:description", content: 'حمّل فيديو يوتيوب Shorts والأصل و MP3 عبر بوت برق. الصق الرابط على الموقع أو تليجرام واختر الجودة.' },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl bg-bg px-4 py-8 text-fg sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/" className="font-display text-sm font-semibold text-accent">
          ← برق ⚡️
        </Link>
        <SiteNav active="/youtube" />
      </div>
      <article className="rounded-[1.75rem] bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        <p className="text-xs font-medium text-accent">دليل عربي · SEO</p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-snug">تحميل فيديو يوتيوب بسهولة</h1>
        <div className="mt-4 space-y-4 text-sm leading-7 text-muted">
          <p>برق يدعم روابط youtube.com و youtu.be و Shorts. بعد لصق الرابط تظهر المعاينة (عنوان، مدة، تقدير الحجم) ثم يكمل البوت التحميل بالجودة التي تختارها — من 360p حتى أفضل جودة متاحة، أو صوت MP3 عند التوفر.</p>
          <p>القوائم التشغيلية: أرسل رابط قائمة ليحصل البوت على المقطع الأول أو يرشدك للرابط الصحيح. روابط القنوات والاشتراكات غير مدعومة كتحميل مباشر.</p>
          <p>البث المباشر يُعالَج بعد انتهائه كفود إن توفر، وليس أثناء البث الحي.</p>
        </div>
        <h2 className="mt-8 font-display text-lg font-semibold">الخطوات</h2>
        <ol className="mt-3 list-decimal space-y-2 pr-5 text-sm leading-7 text-fg">
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <a
          href="https://t.me/barq_ibot"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-action px-6 text-sm font-medium text-action-fg"
        >
          فتح @barq_ibot
        </a>
        <h2 className="mt-10 font-display text-lg font-semibold">أسئلة شائعة</h2>
        <div className="mt-4 space-y-4">
          {FAQS.map((f) => (
            <div key={f.q}>
              <h3 className="text-sm font-medium text-fg">{f.q}</h3>
              <p className="mt-1 text-sm leading-7 text-muted">{f.a}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-xs leading-6 text-subtle">
          برق أداة مساعدة شخصية. احترم حقوق النشر وشروط المنصات. المحتوى يصل من مصدره — فاتقوا الله فيما تشاهدون.
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
