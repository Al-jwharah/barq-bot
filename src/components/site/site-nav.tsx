import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Primary links — kept short so mobile never packs into cramped pills. */
const PRIMARY = [
  { to: "/", label: "الرئيسية" },
  { to: "/pricing", label: "الاشتراكات" },
  { to: "/library", label: "مكتبتي" },
  { to: "/faq", label: "الأسئلة" },
] as const;

const MORE = [
  { to: "/tiktok", label: "تيك توك" },
  { to: "/youtube", label: "يوتيوب" },
  { to: "/instagram", label: "إنستغرام" },
  { to: "/leaderboard", label: "المتصدرين" },
  { to: "/login", label: "دخول" },
] as const;

export function SiteNav({ active }: { active?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex items-center gap-2">
      <nav className="hidden items-center gap-1.5 sm:flex sm:text-sm">
        {PRIMARY.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={cn(
              "rounded-full px-3 py-1.5 font-medium transition-colors",
              active === l.to
                ? "bg-accent text-accent-fg"
                : "bg-surface text-muted shadow-[var(--shadow-border)] hover:text-fg",
            )}
          >
            {l.label}
          </Link>
        ))}
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-full bg-surface px-3 py-1.5 text-muted shadow-[var(--shadow-border)] hover:text-fg [&::-webkit-details-marker]:hidden">
            المزيد
          </summary>
          <div className="absolute end-0 z-40 mt-2 min-w-40 rounded-2xl bg-surface p-2 shadow-[var(--shadow-card)]">
            {MORE.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="block rounded-xl px-3 py-2 text-sm text-muted hover:bg-bg hover:text-fg"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </details>
      </nav>

      {/* Mobile: logo-adjacent compact menu instead of many pills */}
      <button
        type="button"
        className="inline-flex size-9 items-center justify-center rounded-full bg-surface text-fg shadow-[var(--shadow-border)] sm:hidden"
        aria-expanded={open}
        aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>
      {open ? (
        <div className="absolute end-0 top-11 z-40 w-56 rounded-2xl bg-surface p-2 shadow-[var(--shadow-card)] sm:hidden">
          {[...PRIMARY, ...MORE].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className={cn(
                "block rounded-xl px-3 py-2.5 text-sm",
                active === l.to ? "bg-accent/15 font-medium text-accent" : "text-muted hover:bg-bg hover:text-fg",
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-12 space-y-2 pb-8 text-center text-xs text-subtle">
      <p>برق ⚡️ · @barq_ibot · الدعم @i_2169</p>
      <p>info@aljwharah.ai</p>
      <p className="flex flex-wrap items-center justify-center gap-3">
        <Link to="/legal" className="underline decoration-subtle/40 underline-offset-4">
          الشروط والخصوصية
        </Link>
        <Link to="/pricing" className="underline decoration-subtle/40 underline-offset-4">
          الاشتراكات
        </Link>
        <Link to="/faq" className="underline decoration-subtle/40 underline-offset-4">
          الأسئلة
        </Link>
        <a href="https://t.me/barq_ibot" className="underline decoration-subtle/40 underline-offset-4">
          البوت
        </a>
      </p>
    </footer>
  );
}
