import { createFileRoute, Link } from "@tanstack/react-router";
import { LEGAL_BODY } from "@/lib/bot/legal";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({ meta: [{ title: "\u0634\u0631\u0648\u0637 \u0628\u0631\u0642" }] }),
});

function TermsPage() {
  const terms = LEGAL_BODY.split("\u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629")[0] ?? LEGAL_BODY;
  const rest = LEGAL_BODY.includes("\u062d\u0642\u0648\u0642 \u0627\u0644\u0646\u0634\u0631") ? LEGAL_BODY.slice(LEGAL_BODY.indexOf("\u062d\u0642\u0648\u0642 \u0627\u0644\u0646\u0634\u0631")) : "";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-16 pt-5 sm:max-w-lg">
      <Link to="/" className="text-sm underline">\u0628\u0631\u0642 \u26a1\ufe0f</Link>
      <h1 className="mt-6 text-xl font-semibold">\u0634\u0631\u0648\u0637 \u0627\u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645</h1>
      <div className="mt-4 whitespace-pre-wrap text-sm leading-7">{`${terms}\n${rest}`}</div>
    </main>
  );
}
