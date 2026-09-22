import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/", label: "الرئيسية" },
  { to: "/tiktok", label: "تيك توك" },
  { to: "/youtube", label: "يوتيوب" },
  { to: "/instagram", label: "إنستغرام" },
  { to: "/leaderboard", label: "المتصدرين" },
  { to: "/library", label: "مكتبتي" },
  { to: "/faq", label: "الأسئلة" },
] as const;

export function SiteNav({ active }: { active?: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-xs sm:gap-2 sm:text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className={
            active === l.to
              ? "rounded-full bg-accent px-3 py-1.5 font-medium text-accent-fg"
              : "rounded-full bg-surface px-3 py-1.5 text-muted shadow-[var(--shadow-border)] transition-colors hover:text-fg"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
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
