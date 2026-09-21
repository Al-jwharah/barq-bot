/** Catalog only. Charging is gated by subscriptionsLive() — do not flip that until launch. */

export const SAR_PER_STAR_BUNDLE = 4.99;
export const STARS_PER_BUNDLE = 50;

export function starsForSar(sar: number): number {
  if (!Number.isFinite(sar) || sar <= 0) return 0;
  return Math.round((sar / SAR_PER_STAR_BUNDLE) * STARS_PER_BUNDLE);
}

export type PlanId = "plus" | "pro" | "max" | "season";
export type PlanTier = "pro" | "vip";

export type SubPlan = {
  id: PlanId;
  title: string;
  sar: string;
  stars: number;
  days: number;
  tier: PlanTier;
  youtube: boolean;
  ai: boolean;
  dailyCap?: number;
  priority?: boolean;
  blurb: string;
};

export const PLUS_PLAN: SubPlan = {
  id: "plus",
  title: "برق بلس",
  sar: "4.99",
  stars: starsForSar(4.99),
  days: 30,
  tier: "pro",
  youtube: false,
  ai: false,
  blurb: "تحميل بلا حدود — تيك توك وإنستغرام وإكس",
};

export const PRO_PLAN: SubPlan = {
  id: "pro",
  title: "برق برو",
  sar: "9.99",
  stars: starsForSar(9.99),
  days: 30,
  tier: "pro",
  youtube: false,
  ai: false,
  dailyCap: 50,
  priority: true,
  blurb: "50 تحميل/يوم + أولوية في الطابور",
};

export const MAX_PLAN: SubPlan = {
  id: "max",
  title: "برق ماكس",
  sar: "19.99",
  stars: starsForSar(19.99),
  days: 30,
  tier: "vip",
  youtube: true,
  ai: true,
  priority: true,
  blurb: "بلس + يوتيوب + Barq AI بلا حد يومي",
};

export const SEASON_PLAN: SubPlan = {
  id: "season",
  title: "موسم 3 أشهر",
  sar: String(Math.round(Number(PLUS_PLAN.sar) * 3 * 0.8 * 100) / 100),
  stars: starsForSar(Number(PLUS_PLAN.sar) * 3 * 0.8),
  days: 90,
  tier: "pro",
  youtube: false,
  ai: false,
  blurb: "اشترك 3 أشهر ووفّر 20% على بلس",
};

export const SUB_PLANS: Record<PlanId, SubPlan> = {
  plus: PLUS_PLAN,
  pro: PRO_PLAN,
  max: MAX_PLAN,
  season: SEASON_PLAN,
};

export function planById(raw: string | undefined | null): SubPlan | undefined {
  const id = (raw ?? "").toLowerCase().trim();
  if (id === "plus" || id === "sub") return PLUS_PLAN;
  if (id === "pro") return PRO_PLAN;
  if (id === "max" || id === "vip") return MAX_PLAN;
  if (id === "season" || id === "sale") return SEASON_PLAN;
  return undefined;
}

export function parseSubPayload(payload: string): PlanId | undefined {
  const parts = payload.split(":");
  if (parts[0] !== "sub") return undefined;
  return planById(parts[1] ?? "plus")?.id;
}

export function subInvoicePayload(plan: PlanId, tgId: number): string {
  return `sub:${plan}:${tgId}:${Date.now()}`;
}

export function catalogText(live: boolean): string {
  const status = live
    ? "اضغط الخطة للدفع بنجوم تليجرام."
    : "جاهزة — غير مفعّلة للعامة حتى تقول اطلق. المجاني الآن 5 تحميلات/يوم.";
  return [
    "اشتراكات برق ⚡️",
    "",
    status,
    "",
    "مجاني: 5 تحميلات/يوم",
    `${PLUS_PLAN.title} — ${PLUS_PLAN.sar} ر.س = ${PLUS_PLAN.stars} نجمة / شهر`,
    PLUS_PLAN.blurb,
    "",
    `${PRO_PLAN.title} — ${PRO_PLAN.sar} ر.س = ${PRO_PLAN.stars} نجمة / شهر`,
    PRO_PLAN.blurb,
    "",
    `${MAX_PLAN.title} — ${MAX_PLAN.sar} ر.س = ${MAX_PLAN.stars} نجمة / شهر`,
    MAX_PLAN.blurb,
    "",
    `${SEASON_PLAN.title} — ${SEASON_PLAN.sar} ر.س = ${SEASON_PLAN.stars} نجمة / 90 يوم`,
    SEASON_PLAN.blurb,
    "",
    "تجربة 7 أيام بلس: اكتب /trial مرة واحدة.",
    "صرف نجوم بدل الدفع: عند الإطلاق من زر المحفظة.",
    "إحالة: 3 تحميلات لكل صديق. كل 5 دعوات = أسبوع برو مجاني.",
    "كوبون: أرسل /code ثم الكود.",
  ].join("\n");
}
