import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/facebook")({
  head: () => ({
    meta: [
      { title: "تحميل فيديو فيسبوك | برق" },
      { name: "description", content: "حمّل فيديو فيسبوك إلى تليجرام عبر بوت برق. الصق الرابط ويصلك الملف مجانًا." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-bg px-4 py-10 text-fg">
      <h1 className="font-display text-3xl font-semibold">تحميل فيديو فيسبوك</h1>
      <p className="mt-4 text-sm leading-7 text-muted">
        الصق رابط فيسبوك في برق. يصلك الفيديو على تليجرام بأعلى جودة متاحة.
      </p>
      <a href="https://t.me/barq_ibot" className="mt-8 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-accent-fg">
        فتح البوت
      </a>
    </main>
  );
}
