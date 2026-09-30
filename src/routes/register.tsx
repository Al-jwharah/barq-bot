import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter, SiteNav } from "@/components/site/site-nav";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "تسجيل | برق ⚡️" },
      {
        name: "description",
        content: "أنشئ حساب برق — تليجرام أولًا، أو هيكل بريد للمالك لاحقًا.",
      },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
      <header className="flex items-center justify-between gap-3">
        <Link to="/" className="inline-flex h-11 items-center gap-2 rounded-full bg-surface px-3 shadow-[var(--shadow-border)]">
          <img src="/logo.jpg" alt="" className="size-7 rounded-full object-cover" />
          <span className="font-display text-sm font-semibold">برق ⚡️</span>
        </Link>
        <SiteNav active="/register" />
      </header>

      <section className="mt-8 rounded-[1.75rem] bg-surface p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 text-accent" />
          <h1 className="font-display text-2xl font-semibold">إنشاء حساب</h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          أسرع طريق: افتح البوت على تليجرام — حسابك يُنشأ تلقائيًا. البريد أدناه هيكل جاهز فقط.
        </p>

        <a
          href="https://t.me/barq_ibot?start=register"
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-action text-base font-medium text-action-fg hover:opacity-90"
        >
          سجّل من تليجرام
        </a>

        <form
          className="mt-8 space-y-3 border-t border-border pt-6"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(
              "هيكل التسجيل بالبريد جاهز — يحتاج BARQ_EMAIL_AUTH_ENABLED من المالك. المكتبة تبقى خلف تليجرام حاليًا.",
            );
          }}
        >
          <h2 className="text-sm font-medium">البريد (هيكل)</h2>
          <Input
            dir="ltr"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-bg text-left"
          />
          <Input
            dir="ltr"
            type="password"
            autoComplete="new-password"
            placeholder="كلمة مرور (٨+)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-bg text-left"
          />
          <Button type="submit" className="w-full bg-accent text-accent-fg">
            إنشاء بالبريد
          </Button>
          <p className="text-xs text-subtle">
            ENV مقترحة فقط: BARQ_EMAIL_AUTH_ENABLED · BARQ_AUTH_SECRET · لا تُخزَّن أسرار في الواجهة.
          </p>
        </form>

        {msg ? <p className="mt-4 rounded-xl bg-bg px-3 py-2 text-sm text-muted">{msg}</p> : null}

        <p className="mt-6 text-center text-sm text-muted">
          لديك حساب؟{" "}
          <Link to="/login" className="text-accent hover:underline">
            دخول
          </Link>
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
