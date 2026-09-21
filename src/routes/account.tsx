import { createFileRoute, Link } from "@tanstack/react-router";
import { loadAccountPage } from "@/lib/bot/account.functions";

export const Route = createFileRoute("/account")({
  validateSearch: (s: Record<string, unknown>) => ({ t: typeof s.t === "string" ? s.t : "" }),
  loaderDeps: ({ search }) => ({ t: search.t }),
  loader: async ({ deps }) => loadAccountPage({ data: { t: deps.t } }),
  component: AccountPage,
});

function AccountPage() {
  const { account, missing } = Route.useLoaderData();
  if (missing || !account) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center bg-bg px-4 text-center text-fg">
        <h1 className="font-display text-2xl font-semibold">حساب برق</h1>
        <p className="mt-3 text-sm text-muted">افتح الرابط من زر «حسابي» داخل البوت. الرابط ينتهي بعد 12 ساعة.</p>
        <a href="https://t.me/barq_ibot" className="mt-6 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-accent-fg">
          فتح @barq_ibot
        </a>
      </main>
    );
  }
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-bg px-4 py-8 text-fg">
      <h1 className="font-display text-2xl font-semibold">حسابي ⚡️</h1>
      <p className="mt-1 text-sm text-muted">معرف تليجرام {account.tgId}</p>
      <section className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <Stat label="تحميلات ناجحة" value={String(account.downloadsOk)} />
        <Stat label="اليوم" value={String(account.daily)} />
        <Stat label="هذا الشهر" value={String(account.monthly)} />
        <Stat label="الاشتراك" value={account.subscribedUntil ? account.plan : "مجاني"} />
        <Stat label="Barq Points" value={String(account.points)} />
        <Stat label="أكثر منصة" value={account.topPlatform || "—"} />
      </section>
      <p className="mt-4 text-xs text-subtle">100 نقطة = 3 تحميلات من البوت (صرف نقاط). الملفات المؤقتة تُحذف تلقائياً.</p>
      <h2 className="mt-8 text-sm font-semibold">الملفات المحفوظة</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {account.files.length ? (
          account.files.map((f) => (
            <li key={`${f.at}-${f.url}`} className="truncate rounded-2xl border border-subtle px-3 py-2">
              <span className="text-muted">{f.platform || "رابط"} · </span>
              {f.title || f.url}
            </li>
          ))
        ) : (
          <li className="text-muted">ما في تحميلات بعد.</li>
        )}
      </ul>
      <Link to="/" className="mt-8 inline-flex h-11 items-center rounded-full border border-subtle px-5 text-sm">
        الرئيسية
      </Link>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-subtle px-3 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
