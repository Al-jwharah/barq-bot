import { createFileRoute, Link } from "@tanstack/react-router";
import { LEGAL_BODY, LEGAL_TITLE } from "@/lib/bot/legal";

export const Route = createFileRoute("/legal")({
  component: LegalPage,
  head: () => ({
    meta: [{ title: LEGAL_TITLE }],
  }),
});

function LegalPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-16 pt-5 sm:max-w-lg sm:px-6 sm:pt-8">
      <header className="flex items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-surface px-3 shadow-[var(--shadow-border)]"
        >
          <img src="/logo.jpg" alt="" className="bolt-glow size-7 rounded-full object-cover" />
          <span className="font-display text-sm font-semibold tracking-tight">برق ⚡️</span>
        </Link>
      </header>
      <h1 className="mt-8 font-display text-xl font-semibold tracking-tight text-fg">{LEGAL_TITLE}</h1>
      <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-muted">{LEGAL_BODY}</div>
      <p className="mt-8 text-sm leading-7 text-muted">
        التواصل:{" "}
        <a className="underline" href="mailto:info@aljwharah.ai">
          info@aljwharah.ai
        </a>
        {" · "}
        <a className="underline" href="https://t.me/i_2169">
          @i_2169
        </a>
      </p>
    </main>
  );
}
