import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteNav } from "@/components/site/site-nav";

const FAQS = [
    { q: 'هل يعمل مع الريلز فقط؟', a: 'الريلز والمنشورات العامة هي الأفضل دعمًا. القصص الخاصة غير مضمونة.' },
    { q: 'لماذا تفشل بعض الروابط؟', a: 'الحساب الخاص، انتهاء القصة، أو حظر المنطقة قد يمنع الاستخراج.' },
    { q: 'هل أحتاج تسجيل دخول إنستغرام؟', a: 'لا على موقع برق. يكفي الرابط العام.' }
] as const;

const STEPS = [
    'افتح الريل أو المنشور وانسخ الرابط.',
    'الصقه في برق للمعاينة أو في البوت.',
    'استلم الملف واختر الجودة مع الصوت إن توفرت.'
] as const;

export const Route = createFileRoute("/instagram")({
  head: () => ({
    meta: [
      { title: 'تحميل ريلز وقصص إنستغرام | برق ⚡️' },
      { name: "description", content: 'حمّل ريلز ومنشورات إنستغرام إلى تليجرام عبر بوت برق. الصق الرابط، عاين المحتوى، واستلم الملف.' },
      { name: "keywords", content: 'تحميل انستغرام, تحميل ريلز, انستا تليجرام, برق بوت, instagram reels' },
      { property: "og:title", content: 'تحميل ريلز وقصص إنستغرام | برق ⚡️' },
      { property: "og:description", content: 'حمّل ريلز ومنشورات إنستغرام إلى تليجرام عبر بوت برق. الصق الرابط، عاين المحتوى، واستلم الملف.' },
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
        <SiteNav active="/instagram" />
      </div>
      <article className="rounded-[1.75rem] bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        <p className="text-xs font-medium text-accent">دليل عربي · SEO</p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-snug">تحميل فيديو إنستغرام وريلز</h1>
        <div className="mt-4 space-y-4 text-sm leading-7 text-muted">
          <p>برق يستخرج ريلز والمنشورات العامة من إنستغرام ويرسلها إلى تليجرام. الصق الرابط على الموقع لمعاينة سريعة، أو أرسله مباشرة إلى @barq_ibot.</p>
          <p>القصص (Stories) والحسابات الخاصة قد تفشل إذا كان المحتوى غير متاح للعامة. الكاروسيل: يُفضَّل رابط العنصر المطلوب.</p>
          <p>التجربة العربية أولاً: واجهة RTL، رسائل واضحة، وحدود استخدام شفافة داخل البوت.</p>
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
