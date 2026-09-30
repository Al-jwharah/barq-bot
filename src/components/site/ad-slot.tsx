import { useEffect, useState } from "react";

type AdsPayload = {
  enabled: boolean;
  label: string;
  creatives: Array<{ id: string; title: string; body: string; href: string; demo: boolean }>;
};

const FALLBACK: AdsPayload = {
  enabled: false,
  label: "إعلان تجريبي",
  creatives: [
    {
      id: "demo-1",
      title: "مساحة راعٍ",
      body: "مكان أنيق للرعاة — غير مفعّل للإنتاج حتى BARQ_ADS_ENABLED=on",
      href: "https://t.me/barq_ibot",
      demo: true,
    },
  ],
};

export function AdSlot({ placement = "home" }: { placement?: string }) {
  const [data, setData] = useState<AdsPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/ads?placement=${encodeURIComponent(placement)}`)
      .then((r) => r.json())
      .then((d: AdsPayload) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(FALLBACK);
      });
    return () => {
      cancelled = true;
    };
  }, [placement]);

  const payload = data ?? FALLBACK;
  const creative = payload.creatives[0] ?? FALLBACK.creatives[0];

  return (
    <aside
      className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-surface/80 px-4 py-3 shadow-[var(--shadow-border)]"
      aria-label={payload.label}
      data-ads-enabled={payload.enabled ? "1" : "0"}
      data-placement={placement}
    >
      <span className="absolute start-3 top-2 rounded-full bg-bg/80 px-2 py-0.5 text-[10px] font-medium tracking-wide text-subtle">
        {creative.demo || !payload.enabled ? "إعلان تجريبي" : "إعلان"}
      </span>
      <a
        href={creative.href}
        target="_blank"
        rel="noreferrer sponsored"
        className="mt-4 block text-sm hover:text-accent"
      >
        <div className="font-medium text-fg">{creative.title}</div>
        <p className="mt-1 leading-relaxed text-muted">{creative.body}</p>
      </a>
    </aside>
  );
}
