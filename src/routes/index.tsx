import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpLeft, Download, Link2, Loader2, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStatus, resolveMedia } from "@/lib/media/functions";
import type { ExtractResult, MediaItem } from "@/lib/media/types";
import type { BotState } from "@/lib/bot/state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  // Do not call botHealth() during SSR — it re-registers the webhook and can stall 10s+.
  loader: () => ({
    running: true,
    mode: "webhook" as const,
    username: "barq_ibot",
    displayName: "برق ⚡️ لتحميل الفيديوهات",
    lastOkAt: Date.now(),
    processed: 0,
    lastError: null,
    members: 0,
  }),
  component: Home,
});

type HistoryEntry = {
  url: string;
  title: string;
  platform: string;
  at: number;
};

const HISTORY_KEY = "barq-history";

const FEATURES = [
  { title: "أي رابط", body: "يوتيوب، تيك توك، إنستغرام، إكس، فيسبوك أو ملف مباشر — الصق وانتهى." },
  { title: "Barq AI", body: "اكتب لخّص الفيديو، اشرح، حوّل فكرة. يفهم الشات ويرد مباشرة." },
  { title: "مجاني", body: "التحميل مجاني. الحساب يفتح من زر تحت كل مقطع." },
];

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 8)));
}

function platformLabel(p: string) {
  switch (p) {
    case "x":
      return "إكس";
    case "tiktok":
      return "تيك توك";
    case "instagram":
      return "إنستغرام";
    case "youtube":
      return "يوتيوب";
    case "reddit":
      return "ردّيت";
    case "threads":
      return "ثريدز";
    case "facebook":
      return "فيسبوك";
    case "vimeo":
      return "فيميو";
    case "direct":
      return "ملف";
    default:
      return "رابط";
  }
}

function formatBytes(n?: number) {
  if (!n) return null;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n > 20 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatDuration(sec?: number) {
  if (!sec || !Number.isFinite(sec)) return null;
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

function fileUrl(url: string, _filename: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("blob.vercel") || host === "localhost" || host.endsWith(".local")) return "#";
    return url;
  } catch {
    return "#";
  }
}

function Home() {
  const initial = Route.useLoaderData() as BotState;
  const [status, setStatus] = useState(initial);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tour, setTour] = useState<number | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
    try {
      if (!localStorage.getItem("barq-onboarded")) setTour(0);
    } catch {
      /* ignore */
    }
    const t = setInterval(() => {
      void getStatus()
        .then(setStatus)
        .catch(() => undefined);
    }, 8000);
    return () => clearInterval(t);
  }, []);

  const live = status.running && !status.lastError;
  const botHref = `https://t.me/${status.username}`;

  async function onResolve(nextUrl?: string) {
    const target = (nextUrl ?? url).trim();
    if (target.length < 8) {
      toast.error("الصق رابط المنشور أول");
      return;
    }
    setLoading(true);
    try {
      const data = await resolveMedia({ data: { url: target } });
      setResult(data);
      setUrl(data.sourceUrl || target);
      const entry: HistoryEntry = {
        url: data.sourceUrl || target,
        title: data.text || data.author || data.sourceUrl,
        platform: data.platform,
        at: Date.now(),
      };
      const next = [entry, ...history.filter((h) => h.url !== entry.url)].slice(0, 8);
      setHistory(next);
      saveHistory(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "تعذر قراءة الرابط";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-24 pt-5 sm:max-w-lg sm:px-6 sm:pt-8">
      {tour != null ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-[var(--shadow-card)]">
            <p className="text-xs text-muted">تجربة أول استخدام {tour + 1}/3</p>
            <h2 className="mt-2 font-display text-xl font-semibold">
              {["الصق الرابط", "محتوى نظيف", "Barq AI"][tour]}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              {
                [
                  "يوتيوب وتيك توك وإنستغرام وإكس — برق يجهّز الملف ويرسله للتليجرام.",
                  "إسلامي، قصص، ضحك بلا موسيقى. الأغاني والحريم والإباحي مرفوضة.",
                  "اكتب لخّص أو اشرح. أفضل تجربة من البوت مباشرة.",
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
      <header className="flex items-center justify-between gap-3">
        <div className="inline-flex h-11 items-center gap-2 rounded-full bg-surface px-3 shadow-[var(--shadow-border)]">
          <img src="/logo.jpg" alt="" className="bolt-glow size-7 rounded-full object-cover" />
          <span className="font-display text-sm font-semibold tracking-tight">برق ⚡️</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex h-11 items-center gap-2 rounded-full bg-surface px-3 text-xs text-muted shadow-[var(--shadow-border)]">
            <span
              className={cn(
                "size-1.5 rounded-full",
                live ? "bg-live" : "bg-subtle",
              )}
            />
            {live ? "جاهز" : "يتهيأ"}
          </div>
          <Link to="/admin" className="sr-only">
            إدارة
          </Link>
        </div>
      </header>

      <section className="card-enter mt-6 overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-card)]">
        <div className="relative mx-auto aspect-[9/16] max-h-[26rem] w-full bg-surface-2">
          <video
            src="/promo.mp4"
            poster="/logo.jpg"
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/90 to-transparent px-5 pb-5 pt-16">
            <img src="/logo.jpg" alt="" className="size-12 rounded-full object-cover shadow-[var(--shadow-border)]" />
            <h1 className="mt-3 font-display text-2xl font-semibold leading-snug tracking-tight text-fg">
              حمّل أي فيديو بضربة برق
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              الصق الرابط في البوت. Barq AI يفهمك. مجاني — كوب قهوة إن أحببت.
            </p>
          </div>
        </div>
      </section>

      <a
        href={botHref}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-action text-base font-medium text-action-fg transition-[opacity,transform] duration-(--motion-quick) ease-(--ease-out) hover:opacity-90 active:scale-[0.98]"
      >
        ابدأ من تليجرام
      </a>

      <section className="mt-6 grid gap-2">
        {FEATURES.map((f) => (
          <article
            key={f.title}
            className="flex gap-3 rounded-2xl bg-surface px-4 py-3.5 shadow-[var(--shadow-border)]"
          >
            <Zap className="mt-0.5 size-4 shrink-0 text-accent" />
            <div>
              <h2 className="text-sm font-medium text-fg">{f.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          </article>
        ))}
      </section>

      <nav className="mt-6 flex flex-wrap gap-2 text-xs">
        {[
          ["/tiktok", "تيك توك"],
          ["/instagram", "إنستغرام"],
          ["/youtube", "يوتيوب"],
          ["/x", "إكس"],
          ["/facebook", "فيسبوك"],
          ["/snapchat", "سناب"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border border-subtle px-3 py-1 text-muted">
            تحميل {label}
          </a>
        ))}
      </nav>

      <section className="mt-8">
        <p className="mb-3 text-sm text-muted">أو الصق الرابط هنا</p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void onResolve();
          }}
        >
          <label className="sr-only" htmlFor="media-url">
            رابط المنشور
          </label>
          <Input
            id="media-url"
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/…"
            autoComplete="off"
            className="flex-1 bg-surface text-left"
          />
          <Button type="submit" size="lg" disabled={loading} className="bg-accent text-accent-fg sm:min-w-28">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            {loading ? "يجلب…" : "حمّل"}
          </Button>
        </form>

        {result ? <ResultCard result={result} /> : null}

        {history.length > 0 ? (
          <div className="mt-8">
            <h2 className="text-xs font-medium text-muted">آخر الروابط</h2>
            <ul className="mt-3 divide-y divide-border">
              {history.map((h) => (
                <li key={h.at + h.url}>
                  <button
                    type="button"
                    onClick={() => {
                      setUrl(h.url);
                      void onResolve(h.url);
                    }}
                    className="flex w-full items-center gap-3 py-3 text-right"
                  >
                    <span className="rounded-md bg-surface px-2 py-1 text-xs text-muted">
                      {platformLabel(h.platform)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{h.title}</span>
                    <ArrowUpLeft className="size-4 shrink-0 text-subtle" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <p className="mt-8 inline-flex items-center justify-center gap-2 text-xs text-subtle">
        <ShieldCheck className="size-3.5" />
        فاتقوا الله فيما تشاهدون — المحتوى من مصدره
      </p>
      <footer className="mt-4 space-y-1 text-center text-xs text-subtle">
        <p>برق ⚡️ · @barq_ibot · الدعم @i_2169</p>
        <p>info@aljwharah.ai</p>
        <p>
          <Link to="/legal" className="underline decoration-subtle/40 underline-offset-4">
            الشروط والخصوصية
          </Link>
        </p>
      </footer>
    </main>
  );
}

function ResultCard({ result }: { result: ExtractResult }) {
  const primary = result.items[0];
  if (!primary) return null;
  return (
    <section className="mt-8 space-y-4">
      <MediaPreview item={primary} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">{platformLabel(result.platform)}</p>
          <h2 className="mt-1 text-base font-medium text-fg">
            {result.author ?? result.title ?? "ميديا"}
            {result.authorHandle ? (
              <span className="ms-2 text-sm font-normal text-muted">{result.authorHandle}</span>
            ) : null}
          </h2>
        </div>
      </div>
      {result.items.map((item, i) => (
        <QualityRow key={`${item.url}-${i}`} result={result} item={item} index={i} />
      ))}
    </section>
  );
}

function playbackUrl(item: MediaItem): string {
  if (item.kind === "photo") return item.url;
  const ranked = [...item.variants];
  const playable =
    ranked.find((v) => (v.height ?? 0) <= 1080 && (v.height ?? 0) >= 720) ??
    ranked.find((v) => (v.height ?? 0) > 0 && (v.height ?? 0) <= 1080) ??
    ranked[0];
  return playable?.url ?? item.url;
}

function MediaPreview({ item }: { item: MediaItem }) {
  if (item.kind === "photo") {
    return (
      <img
        src={item.url}
        alt=""
        className="max-h-svh w-full rounded-xl object-cover outline outline-1 -outline-offset-1 outline-fg/10"
      />
    );
  }
  const src = playbackUrl(item);
  if (item.kind === "audio") {
    return (
      <audio key={src} src={src} controls className="w-full">
        <track kind="captions" />
      </audio>
    );
  }
  return (
    <video
      key={src}
      src={src}
      poster={item.thumbnail}
      controls
      playsInline
      className="aspect-video w-full rounded-xl bg-surface-2 outline outline-1 -outline-offset-1 outline-fg/10"
    />
  );
}

function QualityRow({
  result,
  item,
  index,
}: {
  result: ExtractResult;
  item: MediaItem;
  index: number;
}) {
  const variants = useMemo(() => {
    const seen = new Set<string>();
    return item.variants.filter((v) => {
      const key = `${v.quality}-${v.width}-${v.height}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [item.variants]);

  const kindLabel =
    item.kind === "photo" ? "صورة" : item.kind === "gif" ? "متحركة" : item.kind === "audio" ? "صوت" : "فيديو";

  return (
    <div className="rounded-xl bg-surface p-3 shadow-[var(--shadow-border)] sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {kindLabel}
          {result.items.length > 1 ? ` ${index + 1}` : ""}
          {formatDuration(item.duration) ? ` · ${formatDuration(item.duration)}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => {
          const name = `barq-${result.id ?? "file"}-${v.quality}.${
            item.kind === "photo" ? "jpg" : item.kind === "audio" ? "m4a" : "mp4"
          }`;
          return (
            <a
              key={v.url}
              href={fileUrl(v.url, name)}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-surface-2 px-3 text-xs text-fg"
            >
              <Download className="size-3.5 text-muted" />
              <span>{v.quality}</span>
              {v.width && v.height ? (
                <span className="text-subtle">
                  {v.width}×{v.height}
                </span>
              ) : null}
              {formatBytes(v.size) ? (
                <span className="tabular-nums text-subtle">{formatBytes(v.size)}</span>
              ) : null}
            </a>
          );
        })}
      </div>
    </div>
  );
}