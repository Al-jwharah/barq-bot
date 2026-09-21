import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/youtube")({
  head: () => ({
    meta: [
      { title: "تحميل فيديو يوتيوب | برق" },
      { name: "description", content: "حمّل فيديو يوتيوب إلى تليجرام عبر بوت برق. الصق الرابط واختر الجودة." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-bg px-4 py-10 text-fg">
      <h1 className="font-display text-3xl font-semibold">تحميل فيديو يوتيوب</h1>
      <p className="mt-4 text-sm leading-7 text-muted">
        الصق رابط يوتيوب في برق. اختَر 360 حتى الأصل أو MP3. البث المباشر يُتابع بعد انتهائه كفود إن توفر.
      </p>
      <ol className="mt-6 list-decimal space-y-2 pr-5 text-sm leading-7">
        <li>انسخ رابط اليوتيوب.</li>
        <li>الصقه في @barq_ibot</li>
        <li>يصلك الملف بأعلى جودة.</li>
      </ol>
      <a href="https://t.me/barq_ibot" className="mt-8 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-accent-fg">
        فتح البوت
      </a>
    </main>
  );
}
