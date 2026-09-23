import { createFileRoute, Link } from "@tanstack/react-router";
import { LEGAL_BODY } from "@/lib/bot/legal";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({ meta: [{ title: "خصوصية برق" }] }),
});

function PrivacyPage() {
  const privacy = LEGAL_BODY.split("حقوق النشر")[0] ?? LEGAL_BODY;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-16 pt-5 sm:max-w-lg">
      <Link to="/" className="text-sm underline">برق ⚡️</Link>
      <h1 className="mt-6 text-xl font-semibold">الخصوصية</h1>
      <div className="mt-4 whitespace-pre-wrap text-sm leading-7">{privacy}</div>
    </main>
  );
}
