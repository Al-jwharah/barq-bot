import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "أسئلة شائعة | برق لتحميل الفيديو" },
      { name: "description", content: "كيف تحمّل تيك توك وإنستغرام ويوتيوب عبر بوت برق، الحدود، الذكاء الاصطناعي، والاشتراك." },
    ],
  }),
  component: Faq,
});

function Faq() {
  const items = [
    ["كيف أحمّل؟", "الصق الرابط في @barq_ibot ويصلك الملف بأعلى جودة."],
    ["تيك توك بدون علامة مائية؟", "نعم. افتح /tiktok أو الصق رابط تيك توك في البوت."],
    ["هل التحميل مجاني؟", "نعم ضمن الحد اليومي. الاشتراكات جاهزة وغير مفعّلة للعامة حتى الإطلاق."],
    ["Barq AI؟", "بعد التحميل اضغط تحليل الفيديو أو اكتب /ai"],
    ["البث المباشر؟", "/live @username — ننبّهك عند البث. التسجيل لساعات يحتاج عاملاً دائماً."],
  ];
  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-bg px-4 py-10 text-fg">
      <h1 className="font-display text-3xl font-semibold">أسئلة شائعة</h1>
      <div className="mt-8 space-y-6">
        {items.map(([q, a]) => (
          <section key={q}>
            <h2 className="text-base font-semibold">{q}</h2>
            <p className="mt-2 text-sm leading-7 text-muted">{a}</p>
          </section>
        ))}
      </div>
      <div className="mt-8 flex gap-3 text-sm">
        <Link to="/tiktok" className="underline">تيك توك</Link>
        <Link to="/instagram" className="underline">إنستغرام</Link>
        <Link to="/youtube" className="underline">يوتيوب</Link>
      </div>
    </main>
  );
}
