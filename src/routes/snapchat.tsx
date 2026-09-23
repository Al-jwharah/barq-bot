import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/snapchat")({
  head: () => ({
    meta: [
      { title: "تحميل فيديو سناب شات | برق" },
      { name: "description", content: "حمّل قصة أو مقطع سناب شات العام إلى تليجرام عبر بوت برق." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-bg px-4 py-10 text-fg">
      <h1 className="font-display text-3xl font-semibold">تحميل فيديو سناب شات</h1>
      <p className="mt-4 text-sm leading-7 text-muted">
        إذا كان الرابط عامًا، الصقه في برق ويصلك الملف على تليجرام.
      </p>
      <a href="https://t.me/barq_ibot" className="mt-8 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-accent-fg">
        فتح البوت
      </a>
    </main>
  );
}
