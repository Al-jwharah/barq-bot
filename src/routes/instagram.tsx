import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/instagram")({
  head: () => ({
    meta: [
      { title: "تحميل فيديو إنستغرام | برق" },
      { name: "description", content: "تحميل ريلز وقصص إنستغرام إلى تليجرام عبر بوت برق. الصق الرابط واستلم الملف." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-bg px-4 py-10 text-fg">
      <h1 className="font-display text-3xl font-semibold">تحميل فيديو إنستغرام</h1>
      <p className="mt-4 text-sm leading-7 text-muted">ريلز ومنشورات إنستغرام. الصق الرابط في برق ويصلك الملف على تليجرام.</p>
      <ol className="mt-6 list-decimal space-y-2 pr-5 text-sm leading-7">
        <li>انسخ رابط الريل أو المنشور.</li>
        <li>أرسله لـ @barq_ibot</li>
        <li>اختر الجودة مع الصوت.</li>
      </ol>
      <a href="https://t.me/barq_ibot" className="mt-8 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-accent-fg">
        فتح البوت
      </a>
    </main>
  );
}
