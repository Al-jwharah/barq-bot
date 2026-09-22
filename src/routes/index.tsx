import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpLeft,
  Download,
  Link2,
  Loader2,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStatus, resolveMedia } from "@/lib/media/functions";
import type { ExtractResult, MediaItem } from "@/lib/media/types";
import {
  formatBytes,
  formatDuration,
  platformLabelAr,
  toLinkPreview,
  type LinkPreview,
} from "@/lib/media/preview";
import type { BotState } from "@/lib/bot/state";
import { cn } from "@/lib/utils";
import { SiteFooter, SiteNav } from "@/components/site/site-nav";

export const Route = createFileRoute("/")({
  loader: () =>
    ({
      running: true,
      mode: "webhook",
      username: "barq_ibot",
      displayName: "برق ⚡️ لتحميل الفيديوهات",
      lastOkAt: Date.now(),
      processed: 0,
      lastError: null,
      members: 0,
    }) satisfies BotState,
  head: () => ({
    meta: [
      { title: "برق ⚡️ حمّل أي فيديو — تيك توك · يوتيوب · إنستغرام" },
      {
        name: "description",
        content:
          "برق منتج عربي مموّل لتحميل الفيديو. معاينة حية قبل البوت، Barq AI، ومكتبة تليجرام. مجاني — كوب قهوة إن أحببت.",
      },
    ],
  }),
  component: HomePage,
});

type Hist = { url: string; title: string; platform: string; at: number };
const HK = "barq-history";
const FEATURES = [
  { title: "معاينة حية", body: "صورة ومدة وحجم تقديري قبل الإرسال للبوت." },
  { title: "Barq AI", body: "اسأل عن الرابط: لخّص، اشرح، اقترح عنوانًا." },
  { title: "مجاني + قهوة", body: "التحميل مجاني. ادعم من 10 إلى 250 نجمة أو USDT." },
] as const;

function readHist(): Hist[] {
  try {
    const raw = localStorage.getItem(HK);
    if (!raw) return [];
    const p = JSON.parse(raw) as Hist[];
    return Array.isArray(p) ? p.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function writeHist(rows: Hist[]) {
  localStorage.setItem(HK, JSON.stringify(rows.slice(0, 8)));
}

function fileUrl(u: string) {
  try {
    const h = new URL(u).hostname.toLowerCase();
    if (h.includes("blob.vercel") || h === "localhost" || h.endsWith(".local")) return "#";
    return u;
  } catch {
    return "#";
  }
}

function HomePage() {
  const initial = Route.useLoaderData();
  const [status, setStatus] = useState(initial);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [hist, setHist] = useState<Hist[]>([]);
  const [tour, setTour] = useState<number | null>(null);
  const [aiQ, setAiQ] = useState("لخّص الفيديو واقترح عنوان تيك توك");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [aiReason, setAiReason] = useState<string | null>(null);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);

  useEffect(() => {
    setHist(readHist());
    try {
      if (!localStorage.getItem("barq-onboarded")) setTour(0);
    } catch {
      /* ignore */
    }
    const t = setInterval(() => {
      void getStatus().then(setStatus).catch(() => undefined);
    }, 8000);
    void fetch("/api/ai-playground")
      .then((r) => r.json())
      .then((d: { ready?: boolean; reason?: string | null }) => {
        setAiReady(Boolean(d.ready));
        setAiReason(d.reason ?? null);
      })
      .catch(() => {
        setAiReady(false);
        setAiReason("تعذر التحقق من Barq AI");
      });
    return () => clearInterval(t);
  }, []);

  const live = status.running && !status.lastError;
  const botHref = `https://t.me/${status.username}`;

  async function onResolve(next?: string) {
    const target = (next ?? url).trim();
    if (target.length < 8) {
      toast.error("الصق رابط المنشور أول");
      return;
    }
    setBusy(true);
    setPreview(null);
    try {
      let data: ExtractResult;
      let lp: LinkPreview;
      try {
        const res = await fetch("/api/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: target }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          preview?: LinkPreview;
          result?: ExtractResult;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.result) throw new Error(json.error || "تعذر المعاينة");
        data = json.result;
        lp = json.preview ?? toLinkPreview(json.result, status.username);
      } catch {
        data = await resolveMedia({ data: { url: target } });
        lp = toLinkPreview(data, status.username);
      }
      setResult(data);
      setPreview(lp);
      setUrl(data.sourceUrl || target);
      const entry: Hist = {
        url: data.sourceUrl || target,
        title: data.text || data.author || data.sourceUrl,
        platform: data.platform,
        at: Date.now(),
      };
      const nextHist = [entry, ...hist.filter((h) => h.url !== entry.url)].slice(0, 8);
      setHist(nextHist);
      writeHist(nextHist);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر قراءة الرابط");
    } finally {
      setBusy(false);
    }
  }

  async function askAi() {
    if (aiReady === false) {
      toast.error(aiReason || "Barq AI غير جاهز");
      return;
    }
    const target = url.trim();
    if (target.length < 8 && aiQ.trim().length < 2) {
      toast.error("الصق رابطًا أو اكتب سؤالًا");
      return;
    }
    setAiBusy(true);
    setAiAnswer(null);
    try {
      const res = await fetch("/api/ai-playground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target, question: aiQ.trim() }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        answer?: string;
        error?: string;
        disabled?: boolean;
      };
      if (!res.ok || !json.ok) {
        if (json.disabled) setAiReady(false);
        throw new Error(json.error || "فشل الطلب");
      }
      setAiAnswer(json.answer || "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل Barq AI");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] overflow-hidden">
        <div className="hero-aurora absolute -inset-20 opacity-70" />
      </div>

      {tour != null ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-[var(--shadow-card)]">
            <p className="text-xs text-muted">تجربة أول استخدام {tour + 1}/3</p>
            <h2 className="mt-2 font-display text-xl font-semibold">
              {["الصق الرابط", "معاينة قبل البوت", "Barq AI"][tour]}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              {
                [
                  "يوتيوب وتيك توك وإنستغرام وإكس — برق يجهّز الملف ويرسله للتليجرام.",
                  "شوف الصورة والمدة والحجم قبل ما تضغط ابدأ من تليجرام.",
                  "اسأل: لخّص أو اشرح. أفضل تجربة من البوت مباشرة.",
                ][tour]
              }
            </p>
            <div className="mt-5 flex gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  if (tour >= 2) {
                    try {
                      localStorage.setItem("barq-onboarded", "1");
                    } catch {
                      /* ignore */
                    }
                    setTour(null);
                  } else setTour(tour + 1);
                }}
              >
                {tour >= 2 ? "ابدأ" : "التالي"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  try {
                    localStorage.setItem("barq-onboarded", "1");
                  } catch {
                    /* ignore */
                  }
                  setTour(null);
                }}
              >
                تخطّي
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex h-11 items-center gap-2 rounded-full bg-surface px-3 shadow-[var(--shadow-border)]">
          <img src="/logo.jpg" alt="" className="bolt-glow size-7 rounded-full object-cover" />
          <span className="font-display text-sm font-semibold tracking-tight">برق ⚡️</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-9 items-center gap-2 rounded-full bg-surface px-3 text-xs text-muted shadow-[var(--shadow-border)]">
            <span className={cn("size-1.5 rounded-full", live ? "bg-live" : "bg-subtle")} />
            {live ? "جاهز" : "يتهيأ"}
          </div>
          <SiteNav active="/" />
        </div>
      </header>

      <section className="card-enter mt-6 overflow-hidden rounded-[2rem] bg-surface shadow-[var(--shadow-card)]">
        <div className="grid md:grid-cols-[1.1fr_0.9fr]">
          <div className="relative aspect-[9/14] max-h-[26rem] bg-surface-2 md:aspect-auto md:min-h-[22rem]">
            <video
              src="/promo.mp4"
              poster="/start-hero.jpg"
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/95 via-bg/55 to-transparent px-5 pb-5 pt-20">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
                <Zap className="size-3" /> منتج عربي مموّل
              </p>
              <h1 className="mt-3 font-display text-3xl font-semibold leading-snug tracking-tight sm:text-4xl">
                حمّل أي فيديو
                <span className="text-accent"> بضربة برق</span>
              </h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
                معاينة حية على الموقع، ثم أرسل للبوت. Barq AI يفهمك. مجاني — كوب قهوة إن أحببت.
              </p>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-4 border-t border-border p-5 md:border-s md:border-t-0 md:p-6">
            <div>
              <h2 className="font-display text-lg font-semibold">تجربة الموقع</h2>
              <p className="mt-1 text-sm text-muted">معاينة ← تليجرام ← ملف نظيف</p>
              <video
                src="/gifs/barq-bolt.mp4"
                autoPlay
                muted
                loop
                playsInline
                className="mt-4 aspect-video w-full rounded-2xl object-cover outline outline-1 -outline-offset-1 outline-fg/10"
              />
            </div>
            <a
              href={botHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-action text-base font-medium text-action-fg hover:opacity-90 active:scale-[0.98]"
            >
              ابدأ من تليجرام
            </a>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-2 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <article key={f.title} className="flex gap-3 rounded-2xl bg-surface px-4 py-3.5 shadow-[var(--shadow-border)]">
            <Zap className="mt-0.5 size-4 shrink-0 text-accent" />
            <div>
              <h2 className="text-sm font-medium">{f.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-8 rounded-[1.75rem] bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="flex items-center gap-2">
          <Link2 className="size-4 text-accent" />
          <h2 className="font-display text-lg font-semibold">معاينة الرابط قبل البوت</h2>
        </div>
        <p className="mt-1 text-sm text-muted">صورة · مدة · منصة · تقدير الحجم</p>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void onResolve();
          }}
        >
          <Input
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://tiktok.com/… أو youtube.com/…"
            className="flex-1 bg-bg text-left"
          />
          <Button type="submit" size="lg" disabled={busy} className="bg-accent text-accent-fg sm:min-w-28">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            {busy ? "يجلب…" : "معاينة"}
          </Button>
        </form>

        {preview ? (
          <div className="mt-6 space-y-4">
            <div className="overflow-hidden rounded-2xl bg-bg outline outline-1 -outline-offset-1 outline-fg/10">
              {preview.thumbnail ? (
                <img src={preview.thumbnail} alt="" className="max-h-80 w-full object-cover" />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-muted">بدون صورة مصغّرة</div>
              )}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">{platformLabelAr(preview.platform)}</p>
                <h3 className="mt-1 text-base font-medium">
                  {preview.author ?? preview.title ?? "ميديا"}
                  {preview.authorHandle ? (
                    <span className="ms-2 text-sm font-normal text-muted">{preview.authorHandle}</span>
                  ) : null}
                </h3>
                <p className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                  {preview.durationLabel ? <span className="rounded-md bg-bg px-2 py-1">⏱ {preview.durationLabel}</span> : null}
                  {preview.sizeEstimateLabel ? (
                    <span className="rounded-md bg-bg px-2 py-1">≈ {preview.sizeEstimateLabel}</span>
                  ) : null}
                </p>
              </div>
              <a
                href={botHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-action px-4 text-sm font-medium text-action-fg"
              >
                <Download className="size-4" />
                أرسل للبوت
              </a>
            </div>
          </div>
        ) : null}

        {result && !preview ? (
          <div className="mt-6 text-sm text-muted">
            {platformLabelAr(result.platform)} · {result.author ?? result.title ?? result.sourceUrl}
          </div>
        ) : null}

        {hist.length > 0 ? (
          <ul className="mt-8 divide-y divide-border">
            {hist.map((h) => (
              <li key={h.at + h.url}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 py-3 text-right"
                  onClick={() => {
                    setUrl(h.url);
                    void onResolve(h.url);
                  }}
                >
                  <span className="rounded-md bg-bg px-2 py-1 text-xs text-muted">{platformLabelAr(h.platform)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{h.title}</span>
                  <ArrowUpLeft className="size-4 text-subtle" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-6 rounded-[1.75rem] bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" />
            <h2 className="font-display text-lg font-semibold">ملعب Barq AI</h2>
          </div>
          <span className={cn("rounded-full px-2.5 py-1 text-[11px]", aiReady ? "bg-live/15 text-live" : "bg-subtle/20 text-muted")}>
            {aiReady == null ? "…" : aiReady ? "مفتاح xAI جاهز" : "متوقف"}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">رد حقيقي إن وُجد المفتاح — بدون DSN وهمي.</p>
        {aiReady === false ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-bg/60 px-4 py-3 text-sm text-muted">
            {aiReason || "أضف XAI_API_KEY في بيئة التشغيل."}
          </div>
        ) : null}
        <div className="mt-4 grid gap-2">
          <Input dir="rtl" value={aiQ} onChange={(e) => setAiQ(e.target.value)} disabled={aiReady === false} className="bg-bg" />
          <Button type="button" disabled={aiBusy || aiReady === false} onClick={() => void askAi()} className="bg-accent text-accent-fg">
            {aiBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {aiBusy ? "يفكّر…" : "اسأل Barq AI"}
          </Button>
        </div>
        {aiAnswer ? <div className="mt-4 whitespace-pre-wrap rounded-2xl bg-bg px-4 py-3 text-sm leading-7">{aiAnswer}</div> : null}
      </section>

      <section className="mt-6 grid gap-2 sm:grid-cols-3">
        {(
          [
            { to: "/tiktok", t: "تيك توك", d: "بدون علامة مائية" },
            { to: "/youtube", t: "يوتيوب", d: "حتى الأصل + MP3" },
            { to: "/instagram", t: "إنستغرام", d: "ريلز وقصص" },
          ] as const
        ).map((p) => (
          <Link key={p.to} to={p.to} className="rounded-2xl bg-surface px-4 py-4 shadow-[var(--shadow-border)] hover:-translate-y-0.5">
            <div className="font-display font-semibold">{p.t}</div>
            <div className="mt-1 text-sm text-muted">{p.d}</div>
          </Link>
        ))}
      </section>

      <p className="mt-8 inline-flex items-center gap-2 self-center text-xs text-subtle">
        <ShieldCheck className="size-3.5" />
        فاتقوا الله فيما تشاهدون — المحتوى من مصدره
      </p>
      <SiteFooter />
    </main>
  );
}
