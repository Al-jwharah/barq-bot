import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/tiktok")({
  head: () => ({
    meta: [
      { title: "تحميل تيك توك بدون علامة مائية | برق" },
      { name: "description", content: "حمّل فيديو تيك توك بدون علامة مائية عبر بوت برق. الصق الرابط في تليجرام واستلم الملف." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-bg px-4 py-10 text-fg">
      <h1 className="font-display text-3xl font-semibold">تحميل تيك توك بدون علامة مائية</h1>
      <p className="mt-4 text-sm leading-7 text-muted">
        برق يحمّل مقاطع تيك توك من الرابط مباشرة إلى تليجرام. بدون تطبيق، وبدون حساب تيك توك.
      </p>
      <ol className="mt-6 list-decimal space-y-2 pr-5 text-sm leading-7">
        <li>انسخ رابط المقطع من تيك توك.</li>
        <li>افتح @barq_ibot والصقه.</li>
        <li>يصلك الملف بأعلى جودة.</li>
      </ol>
      <a href="https://t.me/barq_ibot" className="mt-8 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-accent-fg">
        فتح البوت
      </a>
    </main>
  );
}
