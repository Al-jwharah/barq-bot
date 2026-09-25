import { planById, type PlanId, type SubPlan } from "./plans";

export type PaymentCheck =
  | { ok: true; plan: SubPlan }
  | { ok: false; reason: string };

const CURRENCIES = new Set(["USD", "SAR"]);

export function validateCatalogPayment(input: {
  planId?: string | null;
  amount?: string | number | null;
  currency?: string | null;
  payerId?: string | null;
  orderId?: string | null;
}): PaymentCheck {
  const plan = planById(input.planId);
  if (!plan) return { ok: false, reason: "unknown_plan" };
  if (!input.orderId || !String(input.orderId).trim()) return { ok: false, reason: "missing_order" };
  const currency = String(input.currency ?? "").toUpperCase();
  if (!CURRENCIES.has(currency)) return { ok: false, reason: "bad_currency" };
  const amount = Number(input.amount);
  const expected = Number(plan.sar);
  if (!Number.isFinite(amount) || Math.abs(amount - expected) > 0.001) {
    return { ok: false, reason: "amount_mismatch" };
  }
  if (input.payerId != null && !String(input.payerId).trim()) {
    return { ok: false, reason: "missing_payer" };
  }
  return { ok: true, plan };
}

/** Telegram Stars must match the plan in the invoice payload. Never upgrade from the amount alone. */
export function starsMatchPlan(payload: string, stars: number): SubPlan | null {
  const parts = payload.split(":");
  if (parts[0] !== "sub") return null;
  const plan = planById(parts[1] as PlanId);
  if (!plan) return null;
  if (!Number.isFinite(stars) || stars !== plan.stars) return null;
  return plan;
}
