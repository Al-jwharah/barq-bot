import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter, SiteNav } from "@/components/site/site-nav";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "دخول | برق ⚡️" },
      {
        name: "description",
        content: "سجّل دخولك لبرق عبر تليجرام أو البريد — المكتبة والاشتراكات خلف الحساب.",
      },
    ],
  }),
  component: LoginPage,
});

type AuthInfo = {
  enabled: boolean;
  botUsername: string;
  env: { required: string[]; optional: string[] };
  note: string;
};

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

function LoginPage() {
  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/telegram-auth")
      .then((r) => r.json())
      .then((d: AuthInfo) => setInfo(d))
      .catch(() =>
        setInfo({
          enabled: false,
          botUsername: "barq_ibot",
          env: {
            required: [
              "TELEGRAM_BOT_TOKEN",
              "BARQ_BOT_USERNAME",
              "BARQ_TELEGRAM_LOGIN_ENABLED",
              "BARQ_TELEGRAM_LOGIN_DOMAIN",
            ],
            optional: ["BARQ_TELEGRAM_LOGIN_MAX_AGE_SEC"],
          },
          note: "تعذر قراءة حالة تسجيل الدخول",
        }),
      );
  }, []);

  const onTelegramAuth = useCallback(async (payload: Record<string, unknown>) => {
    setMsg(null);
    try {
      const res = await fetch("/api/telegram-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "فشل الدخول");
      window.location.href = "/library";
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "فشل الدخول");
    }
  }, []);

  useEffect(() => {
    window.onTelegramAuth = onTelegramAuth;
    return () => {
      delete window.onTelegramAuth;
    };
  }, [onTelegramAuth]);

  useEffect(() => {
    if (!info?.enabled || !widgetRef.current) return;
    widgetRef.current.innerHTML = "";
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", info.botUsername);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "12");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    s.setAttribute("data-request-access", "write");
    widgetRef.current.appendChild(s);
  }, [info]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
      <header className="flex items-center justify-between gap-3">
        <Link to="/" className="inline-flex h-11 items-center gap-2 rounded-full bg-surface px-3 shadow-[var(--shadow-border)]">
          <img src="/logo.jpg" alt="" className="size-7 rounded-full object-cover" />
          <span className="font-display text-sm font-semibold">برق ⚡️</span>
        </Link>
        <SiteNav active="/login" />
      </header>

      <section className="mt-8 rounded-[1.75rem] bg-surface p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <LogIn className="size-4 text-accent" />
          <h1 className="font-display text-2xl font-semibold">دخول</h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          المكتبة والاشتراكات خلف حسابك. تليجرام هو الطريق الأساسي — البريد هيكل جاهز للمالك.
        </p>

        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-medium">تليجرام</h2>
          {info?.enabled ? (
            <div ref={widgetRef} className="flex justify-center py-2" />
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-bg/60 px-4 py-3 text-sm text-muted">
              <p>{info?.note || "ودجت تليجرام غير مفعّل بعد."}</p>
              <p className="mt-2 text-xs text-subtle">
                ENV المقترحة: {(info?.env.required ?? []).join(" · ")}
              </p>
              <a
                href={`https://t.me/${info?.botUsername ?? "barq_ibot"}`}
                className="mt-3 inline-flex text-accent underline-offset-4 hover:underline"
              >
                افتح البوت مؤقتًا
              </a>
            </div>
          )}
        </div>

        <form
          className="mt-8 space-y-3 border-t border-border pt-6"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(
              "هيكل البريد/كلمة المرور جاهز — يحتاج BARQ_EMAIL_AUTH_ENABLED + مزوّد جلسات من المالك. لم يُفعَّل بعد.",
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
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-bg text-left"
          />
          <Button type="submit" className="w-full bg-accent text-accent-fg">
            دخول بالبريد
          </Button>
          <p className="text-xs text-subtle">
            مقترح ENV فقط: BARQ_EMAIL_AUTH_ENABLED · BARQ_AUTH_SECRET — لا تُضبط أسرار هنا.
          </p>
        </form>

        {msg ? <p className="mt-4 rounded-xl bg-bg px-3 py-2 text-sm text-muted">{msg}</p> : null}

        <p className="mt-6 text-center text-sm text-muted">
          ليس لديك حساب؟{" "}
          <Link to="/register" className="text-accent hover:underline">
            إنشاء حساب
          </Link>
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
