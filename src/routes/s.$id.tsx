import { createFileRoute, Link } from "@tanstack/react-router";
import { isClipId } from "@/lib/bot/clip-id";
import { loadClip } from "@/lib/bot/clips.functions";

export const Route = createFileRoute("/s/$id")({
  loader: async ({ params }) => {
    if (!isClipId(params.id)) throw new Error("الرابط غير متاح");
    return loadClip({ data: { id: params.id } });
  },
  component: ClipPage,
  errorComponent: () => (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center bg-bg px-4 text-center">
      <h1 className="font-display text-xl font-semibold text-fg">الرابط غير متاح</h1>
      <p className="mt-2 text-sm text-muted">غير موجود أو انتهت صلاحيته.</p>
      <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-accent-fg">
        برق ⚡️
      </Link>
    </main>
  ),
});

function shareHref(kind: "telegram" | "whatsapp" | "x" | "facebook" | "snapchat", url: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent("برق ⚡️");
  if (kind === "telegram") return `https://t.me/share/url?url=${u}&text=${t}`;
  if (kind === "whatsapp") return `https://api.whatsapp.com/send?text=${t}%20${u}`;
  if (kind === "x") return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
  if (kind === "facebook") return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
  return `https://www.snapchat.com/scan?attachmentUrl=${u}`;
}

function ClipPage() {
  const clip = Route.useLoaderData();
  const isPhoto = clip.kind === "photo";
  const isFile = clip.kind === "file" || clip.kind === "document" || clip.kind === "app";
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  async function shareNative() {
    try {
      if (!navigator.share) return;
      const res = await fetch(clip.mediaUrl);
      const blob = await res.blob();
      const file = new File([blob], isPhoto ? "barq.jpg" : "barq.mp4", {
        type: blob.type || (isPhoto ? "image/jpeg" : "video/mp4"),
      });
      const data: ShareData = { files: [file], title: "برق ⚡️" };
      if (navigator.canShare?.(data)) {
        await navigator.share(data);
        return;
      }
      await navigator.share({ title: "برق ⚡️", url: pageUrl || clip.mediaUrl });
    } catch {
      /* user cancel */
    }
  }

  return (
    <main className="relative min-h-dvh bg-bg text-fg">
      {isFile ? (
        <div className="mx-auto flex min-h-[50dvh] max-w-md flex-col items-center justify-center px-4 text-center">
          <h1 className="font-display text-xl font-semibold">ملف مؤقت</h1>
          <p className="mt-2 text-sm text-muted">متاح {clip.hoursLeft} ساعة ثم يُحذف.</p>
          <a
            href={clip.mediaUrl}
            className="mt-6 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-accent-fg"
          >
            تحميل الملف
          </a>
        </div>
      ) : isPhoto ? (
        <img src={clip.mediaUrl} alt="" className="max-h-[70dvh] w-full object-contain" />
      ) : (
        <video
          src={clip.mediaUrl}
          poster={clip.thumbnail ?? undefined}
          controls
          autoPlay
          playsInline
          className="h-[55dvh] w-full bg-bg object-contain"
        />
      )}
      <section className="mx-auto flex max-w-md flex-col gap-2 px-4 py-4">
        <p className="text-center text-sm text-muted">شارك على أي منصة. سناب يفتح المعاينة إن دعم الجهاز.</p>
        <button
          type="button"
          onClick={() => void shareNative()}
          className="inline-flex h-11 items-center justify-center rounded-full bg-accent text-sm text-accent-fg"
        >
          مشاركة من الجهاز (سناب وغيره)
        </button>
        <a
          href={shareHref("snapchat", pageUrl || clip.mediaUrl)}
          className="inline-flex h-11 items-center justify-center rounded-full border border-subtle text-sm"
        >
          فتح سناب شات
        </a>
        <div className="grid grid-cols-2 gap-2">
          <a href={shareHref("telegram", pageUrl || clip.mediaUrl)} className="inline-flex h-11 items-center justify-center rounded-full border border-subtle text-sm">
            تليجرام
          </a>
          <a href={shareHref("whatsapp", pageUrl || clip.mediaUrl)} className="inline-flex h-11 items-center justify-center rounded-full border border-subtle text-sm">
            واتساب
          </a>
          <a href={shareHref("x", pageUrl || clip.mediaUrl)} className="inline-flex h-11 items-center justify-center rounded-full border border-subtle text-sm">
            إكس
          </a>
          <a href={shareHref("facebook", pageUrl || clip.mediaUrl)} className="inline-flex h-11 items-center justify-center rounded-full border border-subtle text-sm">
            فيسبوك
          </a>
        </div>
        <p className="text-center text-[11px] text-subtle">
          سناب لا يسمح بالرفع كتصوير كاميرا من تطبيق خارجي. المشاركة من الجهاز أقرب شيء للمعاينة.
        </p>
      </section>
    </main>
  );
}
