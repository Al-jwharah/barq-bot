import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/site/site-nav";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "لوحة المتصدرين | برق ⚡️" },
      {
        name: "description",
        content: "ترتيب أسبوعي لأكثر المحمّلين عبر برق. يُفعَّل بـ BARQ_LEADERBOARD_LIVE بعد استقرار الإنتاج.",
      },
    ],
  }),
  component: LeaderboardPage,
});

type Row = { tg_id: string; downloads: number; rank: number };

function LeaderboardPage() {
  const [live, setLive] = useState(false);
  const [demo, setDemo] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("جارٍ التحميل…");

  useEffect(() => {
    void fetch("/api/leaderboard?limit=15")
      .then((r) => r.json())
      .then((d: { live?: boolean; demo?: boolean; rows?: Row[]; message?: string }) => {
        setLive(Boolean(d.live));
        setDemo(Boolean(d.demo));
        setRows(d.rows ?? []);
        setMessage(d.message ?? "");
      })
      .catch(() => setMessage("تعذر تحميل اللوحة"));
  }, []);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8 text-fg sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-2 font-display text-lg font-semibold">
          <Trophy className="size-5 text-accent" />
          المتصدرين
        </div>
        <SiteNav active="/leaderboard" />
      </div>

      <section className="rounded-[1.75rem] bg-surface p-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-semibold">لوحة المتصدرين الأسبوعية</h1>
          <span
            className={
              live
                ? "rounded-full bg-live/15 px-2.5 py-1 text-[11px] text-live"
                : "rounded-full bg-subtle/20 px-2.5 py-1 text-[11px] text-muted"
            }
          >
            {live ? "مباشر من Postgres" : "تجريبي / مغلق بالعلم"}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted">{message}</p>
        {!live ? (
          <p className="mt-3 text-xs text-subtle">
            لتفعيل البيانات الحقيقية: <code dir="ltr">BARQ_LEADERBOARD_LIVE=on</code> بعد استقرار 48 ساعة.
          </p>
        ) : null}

        <ol className="mt-6 space-y-2">
          {rows.map((r) => (
            <li
              key={r.tg_id}
              className="flex items-center justify-between rounded-2xl bg-bg px-4 py-3 text-sm shadow-[var(--shadow-border)]"
            >
              <span className="flex items-center gap-3">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-surface-2 font-semibold text-accent">
                  {r.rank}
                </span>
                <span dir="ltr" className="text-muted">
                  …{String(r.tg_id).slice(-4)}
                  {demo ? " · demo" : ""}
                </span>
              </span>
              <span className="tabular-nums font-medium">{r.downloads} تحميل</span>
            </li>
          ))}
        </ol>
      </section>
      <SiteFooter />
    </main>
  );
}
