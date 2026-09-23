import { createFileRoute, Link } from "@tanstack/react-router";
import { LEGAL_BODY } from "@/lib/bot/legal";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({ meta: [{ title: "شروط برق" }] }),
});

function TermsPage() {
  const terms = LEGAL_BODY.split("الخصوصية")[0] ?? LEGAL_BODY;
  const rest = LEGAL_BODY.includes("حقوق النشر") ? LEGAL_BODY.slice(LEGAL_BODY.indexOf("حقوق النشر")) : "";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-16 pt-5 sm:max-w-lg">
      <Link to="/" className="text-sm underline">برق ⚡️</Link>
      <h1 className="mt-6 text-xl font-semibold">شروط الاستخدام</h1>
      <div className="mt-4 whitespace-pre-wrap text-sm leading-7">{`${terms}\n${rest}`}</div>
    </main>
  );
}
