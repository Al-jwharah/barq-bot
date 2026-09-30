import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteNav } from "@/components/site/site-nav";

const FAQS = [
    { q: 'هل يعمل بدون علامة مائية؟', a: 'نحاول تقديم أفضل نسخة متاحة بدون watermark. بعض الروابط المحمية قد تفشل أو تأتي بجودة أقل.' },
    { q: 'هل يدعم الروابط القصيرة؟', a: 'نعم، روابط vm.tiktok.com و vt.tiktok.com تُفك تلقائيًا قبل التحميل.' },
    { q: 'هل التحميل مجاني؟', a: 'نعم ضمن الحدود اليومية/الشهرية المعروضة في البوت. كوب القهوة اختياري.' }
] as const;

const STEPS = [
    'انسخ رابط المقطع من تطبيق تيك توك أو المتصفح.',
    'الصقه في موقع برق للمعاينة، أو مباشرة في @barq_ibot.',
    'اختر الجودة إن ظهرت، واستلم الملف على تليجرام.'
] as const;

export const Route = createFileRoute("/tiktok")({
  head: () => ({
    meta: [
      { title: 'تحميل تيك توك بدون علامة مائية | برق ⚡️' },
      { name: "description", content: 'حمّل فيديو تيك توك بدون علامة مائية إلى تليجرام عبر بوت برق. الصق الرابط، شوف المعاينة، واستلم الملف بجودة عالية.' },
      { name: "keywords", content: 'تحميل تيك توك, تيك توك بدون علامة مائية, تحميل tiktok تليجرام, برق بوت' },
      { property: "og:title", content: 'تحميل تيك توك بدون علامة مائية | برق ⚡️' },
      { property: "og:description", content: 'حمّل فيديو تيك توك بدون علامة مائية إلى تليجرام عبر بوت برق. الصق الرابط، شوف المعاينة، واستلم الملف بجودة عالية.' },
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
        <SiteNav active="/tiktok" />
      </div>
      <article className="rounded-[1.75rem] bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        <p className="text-xs font-medium text-accent">دليل عربي · SEO</p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-snug">تحميل تيك توك بدون علامة مائية</h1>
        <div className="mt-4 space-y-4 text-sm leading-7 text-muted">
          <p>برق يقرأ رابط تيك توك (بما فيها الروابط القصيرة vm.tiktok.com) ويستخرج الفيديو والصوت بدون علامة مائية ظاهرة قدر الإمكان، ثم يرسل الملف إلى محادثتك في تليجرام.</p>
          <p>مناسب لحفظ المقاطع التعليمية والكوميديا والأخبار لإعادة المشاهدة دون تطبيق تيك توك. لا حاجة لحساب تيك توك على الجوال.</p>
          <p>من صفحة برق يمكنك معاينة الصورة والمدة وتقدير الحجم قبل الإرسال للبوت — ثم تكمل التحميل من @barq_ibot.</p>
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
