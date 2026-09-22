import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Library, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteNav } from "@/components/site/site-nav";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "مكتبتي | برق ⚡️" },
      {
        name: "description",
        content: "سجّل دخول تليجرام لعرض سجل تحميلاتك من برق. يحتاج تفعيل مالك البوت لودجت تسجيل الدخول.",
      },
    ],
  }),
  component: LibraryPage,
});

type AuthInfo = {
  enabled: boolean;
  botUsername: string;
  env: { required: string[]; optional: string[] };
  note: string;
};

type LibraryUser = {
  tgId: string;
  firstName: string | null;
  username: string | null;
  photoUrl: string | null;
};

type LibraryFile = {
  url: string;
  title: string | null;
  platform: string | null;
  at: string;
};

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

function LibraryPage() {
  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [user, setUser] = useState<LibraryUser | null>(null);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        disabled?: boolean;
        user?: LibraryUser;
        library?: LibraryFile[];
        envNeeded?: string[];
      };
      if (!res.ok || !json.ok || !json.user) {
        throw new Error(json.error || "فشل تسجيل الدخول");
      }
      setUser(json.user);
      setFiles(json.library ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الدخول");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    window.onTelegramAuth = (u) => {
      void onTelegramAuth(u);
    };
    return () => {
      delete window.onTelegramAuth;
    };
  }, [onTelegramAuth]);

  useEffect(() => {
    if (!info?.enabled || !widgetRef.current || user) return;
    widgetRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", info.botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    widgetRef.current.appendChild(script);
  }, [info, user]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8 text-fg sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-2 font-display text-lg font-semibold">
          <Library className="size-5 text-accent" />
          مكتبتي
        </div>
        <SiteNav active="/library" />
      </div>

      <section className="rounded-[1.75rem] bg-surface p-6 shadow-[var(--shadow-card)]">
        <h1 className="font-display text-2xl font-semibold">مكتبتي على الويب</h1>
        <p className="mt-2 text-sm leading-7 text-muted">
          سجّل دخول تليجرام لعرض آخر تحميلاتك الناجحة من Postgres. هذا مسار B2 — يحتاج إعداد المالك في BotFather.
        </p>

        {!user ? (
          <div className="mt-6 space-y-4">
            {info && !info.enabled ? (
              <div className="rounded-2xl border border-dashed border-border bg-bg/50 p-4 text-sm leading-7 text-muted">
                <p className="font-medium text-fg">Scaffold جاهز — بانتظار إعداد المالك</p>
                <p className="mt-2">{info.note}</p>
                <p className="mt-3 text-xs text-subtle">ENV المقترحة:</p>
                <ul className="mt-1 list-disc space-y-1 pr-5 text-xs text-subtle">
                  {info.env.required.map((e) => (
                    <li key={e}>
                      <code dir="ltr">{e}</code>
                    </li>
                  ))}
                  {info.env.optional.map((e) => (
                    <li key={e}>
                      <code dir="ltr">{e}</code> (اختياري)
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-subtle">
                  BotFather → <code dir="ltr">/setdomain</code> → نطاق الموقع (مثل barq.abdulrhman.ai)
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted">اضغط زر تليجرام لتسجيل الدخول:</p>
                <div ref={widgetRef} className="min-h-12" />
                {busy ? <p className="text-xs text-muted">جارٍ التحقق…</p> : null}
              </div>
            )}
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {user.photoUrl ? (
                  <img src={user.photoUrl} alt="" className="size-12 rounded-full object-cover" />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-sm">TG</div>
                )}
                <div>
                  <p className="font-medium">{user.firstName || "مستخدم تليجرام"}</p>
                  <p className="text-xs text-muted" dir="ltr">
                    {user.username ? `@${user.username}` : user.tgId}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setUser(null);
                  setFiles([]);
                }}
              >
                <LogOut className="size-3.5" />
                خروج
              </Button>
            </div>
            <h2 className="text-sm font-semibold">آخر التحميلات</h2>
            <ul className="space-y-2 text-sm">
              {files.length ? (
                files.map((f) => (
                  <li key={`${f.at}-${f.url}`} className="truncate rounded-2xl border border-border px-3 py-2">
                    <span className="text-muted">{f.platform || "رابط"} · </span>
                    {f.title || f.url}
                  </li>
                ))
              ) : (
                <li className="text-muted">ما في تحميلات بعد — جرّب البوت أول.</li>
              )}
            </ul>
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
