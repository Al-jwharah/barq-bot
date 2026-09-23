import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/x")({
  head: () => ({
    meta: [
      { title: "تحميل فيديو إكس | برق" },
      { name: "description", content: "حمّل فيديو من إكس (تويتر) إلى تليجرام عبر بوت برق. الصق الرابط ويصلك الملف مجانًا." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-bg px-4 py-10 text-fg">
      <h1 className="font-display text-3xl font-semibold">تحميل فيديو إكس</h1>
      <p className="mt-4 text-sm leading-7 text-muted">
        انسخ رابط المنشور من إكس والصقه في برق. يوصل المقطع على تليجرام بدون تطبيق إضافي.
      </p>
      <a href="https://t.me/barq_ibot" className="mt-8 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-accent-fg">
        فتح البوت
      </a>
    </main>
  );
}
