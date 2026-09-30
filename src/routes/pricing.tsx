import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Sparkles, Stars } from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/site/site-nav";
import { AdSlot } from "@/components/site/ad-slot";
import { MAX_PLAN, PLUS_PLAN, PRO_PLAN, SEASON_PLAN, type SubPlan } from "@/lib/bot/plans";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "الاشتراكات | برق ⚡️" },
      {
        name: "description",
        content: "خطط برق بلس وبرو وماكس — ادفع بنجوم تليجرام من البوت. الواجهة على الموقع للمعاينة.",
      },
    ],
  }),
  component: PricingPage,
});

const PLANS: SubPlan[] = [PLUS_PLAN, PRO_PLAN, MAX_PLAN, SEASON_PLAN];

function botCheckoutHref(planId: string) {
  return `https://t.me/barq_ibot?start=sub_${planId}`;
}

function PricingPage() {
  const [subscriptionsLive, setLive] = useState(false);
  const [subscriptionsUi, setUi] = useState(true);

  useEffect(() => {
    void fetch("/api/pricing-flags")
      .then((r) => r.json())
      .then((j: { live?: boolean; ui?: boolean }) => {
        setLive(Boolean(j.live));
        setUi(j.ui !== false);
      })
      .catch(() => undefined);
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
      <header className="flex items-center justify-between gap-3">
        <Link to="/" className="inline-flex h-11 items-center gap-2 rounded-full bg-surface px-3 shadow-[var(--shadow-border)]">
          <img src="/logo.jpg" alt="" className="size-7 rounded-full object-cover" />
          <span className="font-display text-sm font-semibold">برق ⚡️</span>
        </Link>
        <SiteNav active="/pricing" />
      </header>

      <section className="mt-8">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
          <Sparkles className="size-3" /> خطط المنتج
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          اشتراكات برق
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          الدفع من البوت بنجوم تليجرام (Stars). هذه الصفحة للعرض والربط العميق —{" "}
          {subscriptionsLive
            ? "الدفع المباشر مفعّل في البوت."
            : "BARQ_SUBSCRIPTIONS_LIVE ما زال off في الإنتاج."}
        </p>
        {!subscriptionsUi ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface px-4 py-3 text-sm text-muted">
            واجهة الاشتراكات مخفية (BARQ_SUBSCRIPTIONS_UI=off). فعّلها للمعاينة دون تفعيل الدفع الحي.
          </div>
        ) : null}
      </section>

      {subscriptionsUi ? (
        <section className="mt-8 grid gap-3 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className="flex flex-col rounded-[1.5rem] bg-surface p-5 shadow-[var(--shadow-card)]"
            >
              <h2 className="font-display text-xl font-semibold">{plan.title}</h2>
              <p className="mt-1 text-sm text-muted">{plan.blurb}</p>
              <p className="mt-4 font-display text-3xl font-semibold text-accent">
                {plan.sar}
                <span className="ms-1 text-sm font-normal text-muted">ر.س / {plan.days} يوم</span>
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-subtle">
                <Stars className="size-3" /> {plan.stars} نجمة تليجرام
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                {plan.youtube ? (
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" /> يوتيوب
                  </li>
                ) : null}
                {plan.ai ? (
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" /> برق AI
                  </li>
                ) : null}
                {plan.priority ? (
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" /> أولوية طابور
                  </li>
                ) : null}
                {plan.dailyCap ? (
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" /> حتى {plan.dailyCap} تحميل/يوم
                  </li>
                ) : (
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" /> تحميل وفق الخطة
                  </li>
                )}
              </ul>
              <a
                href={botCheckoutHref(plan.id)}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-action text-sm font-medium text-action-fg hover:opacity-90"
              >
                ادفع من البوت
              </a>
            </article>
          ))}
        </section>
      ) : null}

      <section className="mt-8 rounded-[1.5rem] bg-surface p-5 text-sm leading-7 text-muted shadow-[var(--shadow-border)]">
        <h2 className="font-display text-base font-semibold text-fg">كيف تدفع بنجوم تليجرام؟</h2>
        <ol className="mt-3 list-decimal space-y-1 pe-5">
          <li>اضغط «ادفع من البوت» لخطتك.</li>
          <li>في تليجرام اختر الخطة من قائمة الاشتراكات.</li>
          <li>أكمل فاتورة Stars عندما يكون الدفع الحي مفعّلًا.</li>
        </ol>
        <p className="mt-3 text-xs text-subtle">
          المعاينة تستخدم BARQ_SUBSCRIPTIONS_UI — منفصل عن BARQ_SUBSCRIPTIONS_LIVE (يبقى off حتى يقول المالك اطلق).
        </p>
      </section>

      <div className="mt-6">
        <AdSlot placement="pricing" />
      </div>

      <SiteFooter />
    </main>
  );
}
