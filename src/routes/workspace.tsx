import { createFileRoute, Link } from "@tanstack/react-router";
import { advertisedLines, entitlementsFor } from "@/lib/bot/premium";
import { getPublicOrigin } from "@/lib/bot/origin";

export const Route = createFileRoute("/workspace")({
  head: () => {
    const origin = getPublicOrigin();
    return {
      meta: [
        { title: "مساحة العمل | برق" },
        { name: "description", content: "حدود الخطط في برق. التحميل الأساسي مجاني. المزايا المدفوعة تظهر فقط إذا كان الخادم يطبقها." },
        { property: "og:title", content: "مساحة العمل | برق" },
        { name: "twitter:card", content: "summary" },
      ],
      links: origin ? [{ rel: "canonical", href: `${origin}/workspace` }] : [],
    };
  },
  component: WorkspacePage,
});

function WorkspacePage() {
  const tiers = ["free", "plus", "pro", "max"] as const;
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-10">
      <Link to="/" className="text-sm underline">برق ⚡️</Link>
      <h1 className="mt-4 text-2xl font-semibold">مساحة العمل</h1>
      <p className="mt-3 text-sm leading-7 text-muted">
        التحميل الأساسي مجاني للجميع. المشترك الساري يأخذ أولوية الطابور، خمس روابط في الرسالة، السجل، ورسائل AI أكثر. الدفع بالنجوم غير مفتوح للعامة.
      </p>
      <div className="mt-6 space-y-4">
        {tiers.map((tier) => {
          const ent = entitlementsFor(tier);
          return (
            <section key={tier} className="rounded-2xl bg-surface px-4 py-3">
              <h2 className="text-base font-medium">{tier}</h2>
              <ul className="mt-2 space-y-1 text-sm leading-7">
                {advertisedLines(ent).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
