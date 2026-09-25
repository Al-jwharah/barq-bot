import { Link } from "@tanstack/react-router";

const PAGES = [
  { to: "/tiktok", title: "تيك توك", body: "الصق رابط المقطع. التحميل الأساسي مجاني." },
  { to: "/instagram", title: "إنستغرام", body: "ريلز ومنشورات عامة." },
  { to: "/youtube", title: "يوتيوب", body: "يُرسل الملف أو رابط الموقع إذا كان الحجم أكبر من حد تليجرام." },
  { to: "/x", title: "إكس", body: "منشورات الفيديو العامة." },
  { to: "/workspace", title: "مساحة العمل", body: "حدود المجاني وبلس وبرو وماكس كما يطبقها الخادم." },
] as const;

export function PlatformSections() {
  return (
    <section className="mt-6 grid gap-2">
      {PAGES.map((page) => (
        <Link key={page.to} to={page.to} className="rounded-2xl bg-surface px-4 py-3">
          <h2 className="text-sm font-medium">{page.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{page.body}</p>
        </Link>
      ))}
    </section>
  );
}
