import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminBan,
  adminBroadcast,
  adminCreateCode,
  adminGrant,
  adminLogin,
  adminLogout,
  adminSetCodeActive,
  adminSetSetting,
  adminSetSubscription,
  loadAdmin,
} from "@/lib/bot/admin.functions";

const CSRF_HEADER = "x-barq-csrf";
let csrf = "";

function mut<T>(data: T) {
  return { data, headers: { [CSRF_HEADER]: csrf } };
}

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type AdminData = Awaited<ReturnType<typeof loadAdmin>>;
type Tab =
  | "overview"
  | "codes"
  | "grant"
  | "broadcast"
  | "logs"
  | "jobs"
  | "growth"
  | "grok"
  | "system"
  | "channel";

function AdminPage() {
  const [draft, setDraft] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    void loadAdmin()
      .then((result) => {
        csrf = result.csrf;
        setData(result);
      })
      .catch(() => undefined);
  }, []);

  async function unlock(nextPin: string) {
    setLoading(true);
    try {
      await adminLogin({ data: { pin: nextPin } });
      const result = await loadAdmin();
      csrf = result.csrf;
      setData(result);
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "رمز غير صحيح");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    const result = await loadAdmin();
    csrf = result.csrf;
    setData(result);
  }

  async function logout() {
    await adminLogout({ headers: { [CSRF_HEADER]: csrf } }).catch(() => undefined);
    csrf = "";
    setData(null);
  }

  if (!data) {
    return (
      <main className="page-doodle mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
        <div className="rounded-3xl bg-surface p-6 shadow-[var(--shadow-card)]">
          <p className="text-xs font-medium text-muted">لوحة المشرف</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">برق ⚡️</h1>
          <p className="mt-2 text-sm text-muted">أدخل رمز المشرف للمتابعة. الصفحة لك وحدك.</p>
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void unlock(draft);
            }}
          >
            <label className="sr-only" htmlFor="admin-pin">
              الرمز
            </label>
            <Input
              id="admin-pin"
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="رمز المشرف"
              className="bg-surface-2"
            />
            <Button type="submit" className="w-full" disabled={loading || draft.length < 4}>
              {loading ? "يتحقق…" : "دخول"}
            </Button>
          </form>
          <Link to="/" className="mt-4 inline-block text-sm text-muted underline decoration-border">
            العودة
          </Link>
        </div>
      </main>
    );
  }

  const { stats, members, logs, codes, blocked, grok, parsed, clips, jobs, jobCounts, audit, growth } = data;
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "نظرة عامة" },
    { id: "system", label: "النظام" },
    { id: "channel", label: "القناة" },
    { id: "grok", label: "برق AI" },
    { id: "codes", label: "الأكواد" },
    { id: "grant", label: "اشتراكات" },
    { id: "broadcast", label: "إعلان" },
    { id: "logs", label: "التحميلات" },
    { id: "jobs", label: "الطابور" },
    { id: "growth", label: "النمو" },
  ];

  return (
    <main className="page-doodle mx-auto min-h-dvh max-w-3xl px-4 py-6 pb-28 sm:px-6">
      <input type="hidden" name="csrf" value={data.csrf} readOnly autoComplete="off" />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">لوحة المشرف</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">برق ⚡️</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            تحديث
          </Button>
          <Button variant="outline" onClick={() => void logout()}>
            خروج
          </Button>
          <Link
            to="/"
            className="inline-flex h-11 items-center rounded-lg px-4 text-sm text-muted shadow-[var(--shadow-border)]"
          >
            الموقع
          </Link>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="أعضاء" value={stats.members} />
        <Stat label="مشتركين" value={stats.subscribers} />
        <Stat label="تحميلات" value={stats.downloads} />
        <Stat label="نجاح %" value={stats.successRate ?? 0} />
        <Stat label="روابط" value={stats.clips} />
        <Stat label="حجب" value={stats.blocked} />
        <Stat label="فشل" value={stats.failed} />
        <Stat label="معجبون" value={growth?.likes ?? 0} />
        <Stat label="نجوم" value={stats.stars} />
      </section>

      <nav className="mt-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "h-11 rounded-full bg-accent px-4 text-sm text-accent-fg"
                : "h-11 rounded-full bg-surface px-4 text-sm text-muted shadow-[var(--shadow-border)]"
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <MembersTab members={members} onDone={refresh} />
      ) : null}

      {tab === "system" ? <SystemTab parsed={parsed} onDone={refresh} /> : null}
      {tab === "channel" ? <ChannelTab parsed={parsed} onDone={refresh} /> : null}
      {tab === "codes" ? <CodesTab codes={codes} onDone={refresh} /> : null}
      {tab === "grant" ? <GrantTab onDone={refresh} /> : null}
      {tab === "broadcast" ? <BroadcastTab parsed={parsed} onDone={refresh} /> : null}
      {tab === "grok" ? (
        <GrokTab grok={grok} stats={stats} blocked={blocked} parsed={parsed} onDone={refresh} />
      ) : null}
      {tab === "logs" ? <LogsTab logs={logs} clips={clips} /> : null}
      {tab === "jobs" ? <JobsTab jobs={jobs ?? []} counts={jobCounts ?? undefined} audit={audit ?? []} /> : null}
      {tab === "growth" ? <GrowthTab growth={growth} /> : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Toggle({
  settingKey,
  value,
  onDone,
  label,
}: {
  settingKey: string;
  value: boolean;
  onDone: () => Promise<void>;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await adminSetSetting(mut({ key: settingKey, value: value ? "off" : "on" }));
          toast.success(value ? "أُوقف" : "شُغّل");
          await onDone();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "تعذر الحفظ");
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}: {value ? "تشغيل" : "إيقاف"}
    </Button>
  );
}

function SystemTab({
  parsed,
  onDone,
}: {
  parsed: AdminData["parsed"];
  onDone: () => Promise<void>;
}) {
  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-sm font-medium">تشغيل النظام</h2>
        <p className="mt-1 text-sm text-muted">إيقاف البوت يمنع المستخدمين. المالك يبقى يعمل.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Toggle settingKey="bot_paused" value={parsed.paused} onDone={onDone} label="إيقاف البوت" />
          <Toggle
           
            settingKey="restrictions_on"
            value={parsed.restrictionsOn}
            onDone={onDone}
            label="القيود"
          />
          <Toggle
           
            settingKey="ads_enabled"
            value={parsed.adsEnabled}
            onDone={onDone}
            label="الإعلانات"
          />
        </div>
        <p className="mt-4 text-xs text-muted">كل فيديو أو أغنية تخرج بإخلاء مسؤولية ديني بسيط.</p>
      </div>
      <AdsTextForm current={parsed.adsText} onDone={onDone} />
    </section>
  );
}

function AdsTextForm({
  current,
  onDone,
}: {
  current: string;
  onDone: () => Promise<void>;
}) {
  const [text, setText] = useState(current);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await adminSetSetting(mut({ key: "ads_text", value: text }));
          toast.success("حُفظ نص الإعلان");
          await onDone();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "تعذر الحفظ");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-sm font-medium">نص الإعلان</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={1000}
        className="mt-3 w-full rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button type="submit" className="mt-3" disabled={busy}>
        حفظ
      </Button>
    </form>
  );
}

function ChannelTab({
  parsed,
  onDone,
}: {
  parsed: AdminData["parsed"];
  onDone: () => Promise<void>;
}) {
  const [channel, setChannel] = useState(parsed.requiredChannel ? `@${parsed.requiredChannel}` : "");
  const [free, setFree] = useState(String(parsed.freeDownloads));
  const [busy, setBusy] = useState(false);
  return (
    <section className="mt-6 space-y-4">
      <form
        className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await adminSetSetting(mut({ key: "required_channel", value: channel }));
            await adminSetSetting(mut({ key: "free_downloads", value: free }));
            toast.success("حُفظت القناة والمجاني");
            await onDone();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "تعذر الحفظ");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="text-sm font-medium">قناة التحميل المجاني</h2>
        <p className="mt-1 text-sm text-muted">
          المستخدم ينضم للقناة ثم يحصل على العدد المحدد. اجعل البوت مشرفًا في القناة ليتحقق من الأعضاء.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="@channel"
            dir="ltr"
            className="bg-surface-2 text-left"
          />
          <Input
            value={free}
            onChange={(e) => setFree(e.target.value)}
            placeholder="عدد المجاني"
            inputMode="numeric"
            className="bg-surface-2"
          />
        </div>
        <Button type="submit" className="mt-3" disabled={busy}>
          حفظ
        </Button>
      </form>
    </section>
  );
}

function CodesTab({
  codes,
  onDone,
}: {
  codes: AdminData["codes"];
  onDone: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [days, setDays] = useState("30");
  const [maxUses, setMaxUses] = useState("20");
  const [busy, setBusy] = useState(false);

  return (
    <section className="mt-6 space-y-4">
      <form
        className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const saved = await adminCreateCode(
              mut({ code, days: Number(days), maxUses: Number(maxUses) }),
            );
            toast.success(`تم حفظ ${saved.code}`);
            setCode("");
            await onDone();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "تعذر إنشاء الكود");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="text-sm font-medium">إصدار كود اشتراك</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <Input
            id="new-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="BARQ30"
            className="bg-surface-2 uppercase"
          />
          <Input
            id="new-days"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="أيام"
            inputMode="numeric"
            className="bg-surface-2"
          />
          <Input
            id="new-uses"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="استخدامات"
            inputMode="numeric"
            className="bg-surface-2"
          />
          <Button type="submit" disabled={busy}>
            إصدار
          </Button>
        </div>
      </form>
      <div className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
        <table className="w-full text-right text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">الكود</th>
              <th className="px-4 py-2 font-medium">أيام</th>
              <th className="px-4 py-2 font-medium">استخدام</th>
              <th className="px-4 py-2 font-medium">حالة</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.code} className="border-t border-border">
                <td className="px-4 py-2 font-mono">{c.code}</td>
                <td className="px-4 py-2 tabular-nums">{c.days}</td>
                <td className="px-4 py-2 tabular-nums">
                  {c.used_count} / {c.max_uses}
                </td>
                <td className="px-4 py-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await adminSetCodeActive(mut({ code: c.code, active: !c.active }));
                        await onDone();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "تعذر التحديث");
                      }
                    }}
                  >
                    {c.active ? "إلغاء" : "تشغيل"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {codes.length === 0 ? <p className="px-4 py-8 text-sm text-muted">لا أكواد بعد.</p> : null}
      </div>
    </section>
  );
}

function GrantTab({ onDone }: { onDone: () => Promise<void> }) {
  const [tgId, setTgId] = useState("");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  return (
    <section className="mt-6 space-y-4">
      <section className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-sm font-medium">تفعيل اشتراك</h2>
        <p className="mt-1 text-sm text-muted">يمنح أيامًا تُضاف لمدة الاشتراك الحالية.</p>
        <form
          className="mt-4 grid gap-2 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await adminGrant(mut({ tgId, days: Number(days) }));
              toast.success("تم التفعيل");
              setTgId("");
              await onDone();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "تعذر التفعيل");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            value={tgId}
            onChange={(e) => setTgId(e.target.value)}
            placeholder="Telegram ID"
            dir="ltr"
            className="bg-surface-2 text-left"
          />
          <Input
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="أيام"
            inputMode="numeric"
            className="bg-surface-2"
          />
          <Button type="submit" disabled={busy}>
            تفعيل
          </Button>
        </form>
      </section>
      <EditSubForm onDone={onDone} />
    </section>
  );
}

function EditSubForm({ onDone }: { onDone: () => Promise<void> }) {
  const [tgId, setTgId] = useState("");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await adminSetSubscription(mut({ tgId, days: Number(days) }));
          toast.success(Number(days) <= 0 ? "أُلغي الاشتراك" : "عُدّل الاشتراك");
          setTgId("");
          await onDone();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "تعذر التعديل");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-sm font-medium">تعديل أو إلغاء اشتراك</h2>
      <p className="mt-1 text-sm text-muted">يعيد المدة من الآن. 0 يلغي الاشتراك.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Input
          value={tgId}
          onChange={(e) => setTgId(e.target.value)}
          placeholder="Telegram ID"
          dir="ltr"
          className="bg-surface-2 text-left"
        />
        <Input
          value={days}
          onChange={(e) => setDays(e.target.value)}
          placeholder="أيام"
          inputMode="numeric"
          className="bg-surface-2"
        />
        <Button type="submit" disabled={busy}>
          تعديل
        </Button>
      </div>
    </form>
  );
}

function BroadcastTab({
  parsed,
  onDone,
}: {
  parsed: AdminData["parsed"];
  onDone: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <Toggle settingKey="ads_enabled" value={parsed.adsEnabled} onDone={onDone} label="تشغيل الإعلان" />
      </div>
      <section className="rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <h2 className="text-sm font-medium">إرسال للجميع</h2>
        <p className="mt-1 text-sm text-muted">تصل الرسالة لكل من بدأ البوت.</p>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const result = await adminBroadcast(mut({ text }));
              toast.success(`أُرسلت إلى ${result.sent} من ${result.total}`);
              setText("");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "تعذر الإرسال");
            } finally {
              setBusy(false);
            }
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={3500}
            placeholder="نص الرسالة"
            className="w-full rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" disabled={busy || text.trim().length === 0}>
            إرسال
          </Button>
        </form>
      </section>
    </section>
  );
}

function GrokTab({
  grok,
  stats,
  blocked,
  parsed,
  onDone,
}: {
  grok: boolean;
  stats: AdminData["stats"];
  blocked: AdminData["blocked"];
  parsed: AdminData["parsed"];
  onDone: () => Promise<void>;
}) {
  const models = [
    { id: "grok-4.5", label: "Grok 4.5", hint: "الأحدث والأقوى — الافتراضي" },
    { id: "grok-4", label: "Grok 4", hint: "متوازن للردود اليومية" },
    { id: "grok-3", label: "Grok 3", hint: "خفيف وأسرع" },
  ] as const;
  const speeds = [
    ["fast", "سريع"],
    ["balanced", "متوازن"],
    ["thorough", "متعمق"],
  ] as const;
  const current = models.find((m) => m.id === parsed.grokModel) ?? models[0];

  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-2xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <p className="text-xs font-medium text-muted">برق AI داخل البوت — للمالك فقط</p>
        <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
          {grok ? "متصل" : "غير متصل"} · {current.label}
        </h2>
        <p className="mt-2 text-sm text-muted">
          المالك {stats.ownerId} يكتب في تليجرام فيرد النموذج المختار. كل فيديو أو أغنية تخرج بإخلاء
          مسؤولية ديني بسيط.
        </p>
      </div>

      <div className="rounded-2xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <h3 className="text-sm font-medium">النموذج</h3>
        <p className="mt-1 text-sm text-muted">هذا اللي يرد عليك داخل البوت. اضغط لتغييره فورًا.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {models.map((model) => {
            const on = parsed.grokModel === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={async () => {
                  try {
                    await adminSetSetting(mut({ key: "grok_model", value: model.id }));
                    toast.success(`النموذج: ${model.label}`);
                    await onDone();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "تعذر الحفظ");
                  }
                }}
                className={
                  on
                    ? "rounded-2xl bg-accent px-4 py-4 text-right text-accent-fg"
                    : "rounded-2xl bg-surface-2 px-4 py-4 text-right text-fg shadow-[var(--shadow-border)]"
                }
              >
                <p className="text-sm font-semibold">{on ? `✓ ${model.label}` : model.label}</p>
                <p className={`mt-1 text-xs ${on ? "text-accent-fg/80" : "text-muted"}`}>{model.hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <h3 className="text-sm font-medium">السرعة</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {speeds.map(([speed, label]) => (
            <Button
              key={speed}
              variant={parsed.grokSpeed === speed ? "default" : "outline"}
              onClick={async () => {
                try {
                  await adminSetSetting(mut({ key: "grok_speed", value: speed }));
                  await onDone();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "تعذر الحفظ");
                }
              }}
            >
              {parsed.grokSpeed === speed ? `• ${label}` : label}
            </Button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Toggle settingKey="grok_owner" value={parsed.grokOwner} onDone={onDone} label="المحادثة" />
          <Toggle settingKey="grok_tools" value={parsed.grokTools} onDone={onDone} label="الأدوات" />
          <Toggle
           
            settingKey="grok_web_search"
            value={parsed.grokWebSearch}
            onDone={onDone}
            label="البحث في النت"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
        <h2 className="px-4 pt-4 text-sm font-medium">محاولات إباحية محجوبة</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">الوقت</th>
                <th className="px-4 py-2 font-medium">المستخدم</th>
                <th className="px-4 py-2 font-medium">الدليل</th>
                <th className="px-4 py-2 font-medium">الرابط</th>
              </tr>
            </thead>
            <tbody>
              {blocked.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-2 text-xs text-muted">
                    {String(row.created_at).slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{row.tg_id ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">{row.evidence ?? row.reason ?? "—"}</td>
                  <td className="max-w-44 truncate px-4 py-2 text-xs" dir="ltr">
                    {row.url}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {blocked.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted">لا محاولات محجوبة بعد.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function LogsTab({ logs, clips }: { logs: AdminData["logs"]; clips: AdminData["clips"] }) {
  return (
    <section className="mt-6 space-y-4">
      <section className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
        <h2 className="px-4 pt-4 text-sm font-medium">سجل التحميلات</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">الوقت</th>
                <th className="px-4 py-2 font-medium">المستخدم</th>
                <th className="px-4 py-2 font-medium">المنصة</th>
                <th className="px-4 py-2 font-medium">الحالة</th>
                <th className="px-4 py-2 font-medium">الرابط</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-2 text-xs text-muted">
                    {String(row.created_at).slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{row.tg_id ?? "—"}</td>
                  <td className="px-4 py-2">{row.platform ?? "—"}</td>
                  <td className="px-4 py-2">{row.blocked ? "حجب إباحي" : row.ok ? "تم" : "فشل"}</td>
                  <td className="max-w-56 truncate px-4 py-2 text-xs" dir="ltr">
                    {row.url}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted">لا تحميلات مسجّلة بعد.</p>
          ) : null}
        </div>
      </section>
      <section className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
        <h2 className="px-4 pt-4 text-sm font-medium">روابط مختصرة</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">المعرّف</th>
                <th className="px-4 py-2 font-medium">المستخدم</th>
                <th className="px-4 py-2 font-medium">النوع</th>
                <th className="px-4 py-2 font-medium">تحميلات</th>
              </tr>
            </thead>
            <tbody>
              {clips.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link to="/s/$id" params={{ id: c.id }} className="underline decoration-border">
                      {c.id}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{c.tg_id}</td>
                  <td className="px-4 py-2 text-xs">{c.kind ?? "—"}</td>
                  <td className="px-4 py-2 tabular-nums text-xs">{c.hits ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {clips.length === 0 ? <p className="px-4 py-8 text-sm text-muted">لا روابط بعد.</p> : null}
        </div>
      </section>
    </section>
  );
}

function MembersTab({
  members,
  onDone,
}: {
  members: AdminData["members"];
  onDone: () => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const filtered = members.filter((m) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      m.tg_id.includes(s) ||
      (m.username ?? "").toLowerCase().includes(s) ||
      (m.first_name ?? "").toLowerCase().includes(s)
    );
  });
  return (
    <section className="mt-6 overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <h2 className="text-sm font-medium">الأعضاء</h2>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث بالمعرف أو الاسم"
          className="max-w-xs bg-surface-2"
        />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">المعرّف</th>
              <th className="px-4 py-2 font-medium">الاسم</th>
              <th className="px-4 py-2 font-medium">دور</th>
              <th className="px-4 py-2 font-medium">تحميلات</th>
              <th className="px-4 py-2 font-medium">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.tg_id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{m.tg_id}</td>
                <td className="px-4 py-2">
                  {m.first_name ?? "—"}
                  {m.username ? <span className="ms-1 text-muted">@{m.username}</span> : null}
                  {m.is_banned ? <span className="ms-1 text-xs text-red-400">محظور</span> : null}
                </td>
                <td className="px-4 py-2 text-xs">{m.role ?? (m.is_admin ? "admin" : "user")}</td>
                <td className="px-4 py-2 tabular-nums">{m.downloads_used}</td>
                <td className="px-4 py-2">
                  <Button
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    onClick={async () => {
                      try {
                        await adminBan(mut({ tgId: m.tg_id, banned: !m.is_banned }));
                        await onDone();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "تعذر");
                      }
                    }}
                  >
                    {m.is_banned ? "فك الحظر" : "حظر"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted">لا نتائج.</p>
        ) : null}
      </div>
    </section>
  );
}

function JobsTab({
  jobs,
  counts,
  audit,
}: {
  jobs: Array<{
    id: string;
    tg_id: string;
    status: string;
    attempts: number;
    error: string | null;
    created_at: string;
  }>;
  counts?: Record<string, number>;
  audit: Array<{ id: number; action: string; target: string | null; created_at: string }>;
}) {
  return (
    <section className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {["pending", "processing", "uploading", "completed", "failed", "cancelled", "expired"].map((k) => (
          <Stat key={k} label={k} value={counts?.[k] ?? 0} />
        ))}
      </div>
      <section className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
        <h2 className="px-4 pt-4 text-sm font-medium">وظائف التحميل</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">الحالة</th>
                <th className="px-4 py-2 font-medium">المستخدم</th>
                <th className="px-4 py-2 font-medium">محاولات</th>
                <th className="px-4 py-2 font-medium">خطأ</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-border">
                  <td className="px-4 py-2 text-xs">{j.status}</td>
                  <td className="px-4 py-2 font-mono text-xs">{j.tg_id}</td>
                  <td className="px-4 py-2 tabular-nums">{j.attempts}</td>
                  <td className="max-w-56 truncate px-4 py-2 text-xs">{j.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {jobs.length === 0 ? <p className="px-4 py-8 text-sm text-muted">لا وظائف بعد.</p> : null}
        </div>
      </section>
      <section className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
        <h2 className="px-4 pt-4 text-sm font-medium">سجل الإدارة</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">الوقت</th>
                <th className="px-4 py-2 font-medium">الإجراء</th>
                <th className="px-4 py-2 font-medium">الهدف</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-2 text-xs text-muted">
                    {String(a.created_at).slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-2 text-xs">{a.action}</td>
                  <td className="px-4 py-2 font-mono text-xs">{a.target ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {audit.length === 0 ? <p className="px-4 py-8 text-sm text-muted">لا أحداث بعد.</p> : null}
        </div>
      </section>
    </section>
  );
}

function GrowthTab({ growth }: { growth: AdminData["growth"] }) {
  if (!growth) {
    return <p className="mt-6 text-sm text-muted">لا بيانات نمو بعد.</p>;
  }
  return (
    <section className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="اليوم (DAU)" value={growth.dau} />
        <Stat label="الأسبوع (WAU)" value={growth.wau} />
        <Stat label="جدد اليوم" value={growth.newToday} />
        <Stat label="أتمّوا البداية %" value={growth.onboardPct} />
        <Stat label="سلسلة ٣+" value={growth.streak3} />
        <Stat label="مستخدمو النمو" value={growth.users} />
        <Stat label="D1 %" value={growth.retention?.d1 ?? 0} />
        <Stat label="D7 %" value={growth.retention?.d7 ?? 0} />
        <Stat label="D30 %" value={growth.retention?.d30 ?? 0} />
        <Stat label="تقييمات" value={growth.feedback?.count ?? 0} />
        <Stat label="معجبون" value={growth.likes ?? 0} />
      </div>
      <section className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
        <h2 className="px-4 pt-4 text-sm font-medium">أحداث ٧ أيام</h2>
        <ul className="divide-y divide-border px-4 py-2 text-sm">
          {growth.events.map((e) => (
            <li key={e.name} className="flex justify-between py-2">
              <span>{e.name}</span>
              <span className="tabular-nums">{e.c}</span>
            </li>
          ))}
          {growth.events.length === 0 ? <li className="py-6 text-muted">لا أحداث.</li> : null}
        </ul>
      </section>
      <section className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
        <h2 className="px-4 pt-4 text-sm font-medium">الإنجازات</h2>
        <ul className="divide-y divide-border px-4 py-2 text-sm">
          {growth.unlocks.map((u) => (
            <li key={u.code} className="flex justify-between py-2">
              <span>{u.code}</span>
              <span className="tabular-nums">{u.c}</span>
            </li>
          ))}
          {growth.unlocks.length === 0 ? <li className="py-6 text-muted">لا إنجازات بعد.</li> : null}
        </ul>
      </section>
    </section>
  );
}
