import { createFileRoute, Link } from "@tanstack/react-router";
import { LEGAL_BODY } from "@/lib/bot/legal";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({ meta: [{ title: "\u062e\u0635\u0648\u0635\u064a\u0629 \u0628\u0631\u0642" }] }),
});

function PrivacyPage() {
  const privacy = LEGAL_BODY.split("\u062d\u0642\u0648\u0642 \u0627\u0644\u0646\u0634\u0631")[0] ?? LEGAL_BODY;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-16 pt-5 sm:max-w-lg">
      <Link to="/" className="text-sm underline">\u0628\u0631\u0642 \u26a1\ufe0f</Link>
      <h1 className="mt-6 text-xl font-semibold">\u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629</h1>
      <div className="mt-4 whitespace-pre-wrap text-sm leading-7">{privacy}</div>
    </main>
  );
}
