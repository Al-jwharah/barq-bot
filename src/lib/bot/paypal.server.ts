import { validateCatalogPayment, type PaymentCheck } from "./payment-validation";

export const PAYPAL_ENV = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"] as const;

export function paypalEnvStatus(): Record<(typeof PAYPAL_ENV)[number], "present" | "missing"> {
  const out = {} as Record<(typeof PAYPAL_ENV)[number], "present" | "missing">;
  for (const name of PAYPAL_ENV) {
    const raw = typeof process === "undefined" ? "" : process.env[name];
    out[name] = raw && raw.trim() ? "present" : "missing";
  }
  return out;
}

export function paypalEnabled(): boolean {
  return PAYPAL_ENV.every((name) => paypalEnvStatus()[name] === "present");
}

export type WebhookDecision =
  | { ok: true; planId: string; eventId: string }
  | { ok: false; reason: string };

export function verifyPaypalEvent(input: {
  enabled: boolean;
  eventId?: string | null;
  eventType?: string | null;
  webhookId?: string | null;
  expectedWebhookId?: string | null;
  transmissionSig?: string | null;
  planId?: string | null;
  amount?: string | number | null;
  currency?: string | null;
  payerId?: string | null;
  orderId?: string | null;
  seen?: boolean;
}): WebhookDecision {
  if (!input.enabled) return { ok: false, reason: "paypal_disabled" };
  if (!input.eventId || !input.transmissionSig) return { ok: false, reason: "malformed" };
  if (!input.expectedWebhookId || input.webhookId !== input.expectedWebhookId) {
    return { ok: false, reason: "bad_webhook" };
  }
  if (input.seen) return { ok: false, reason: "replay" };
  if (input.eventType !== "PAYMENT.CAPTURE.COMPLETED" && input.eventType !== "CHECKOUT.ORDER.APPROVED") {
    return { ok: false, reason: "ignored_event" };
  }
  const check: PaymentCheck = validateCatalogPayment({
    planId: input.planId,
    amount: input.amount,
    currency: input.currency,
    payerId: input.payerId,
    orderId: input.orderId,
  });
  if (!check.ok) return { ok: false, reason: check.reason };
  return { ok: true, planId: check.plan.id, eventId: input.eventId };
}
