import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { paypalEnabled, verifyPaypalEvent } from "@/lib/bot/paypal.server";
import { recordPayment } from "@/lib/bot/store.server";
import { planById } from "@/lib/bot/plans";

export const Route = createFileRoute("/api/paypal/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!paypalEnabled()) {
          return Response.json({ ok: false, reason: "paypal_disabled" }, { status: 503 });
        }
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ ok: false, reason: "malformed" }, { status: 400 });
        }
        const resource = (body.resource ?? {}) as Record<string, unknown>;
        const amountObj = (resource.amount ?? {}) as Record<string, unknown>;
        const custom = String(resource.custom_id ?? "");
        const [planId, tgRaw] = custom.split(":");
        const eventId = String(body.id ?? "");
        const sql = await getSql();
        const seenRows = await sql<{ c: number }>`
          select count(*)::int as c from paypal_events where event_id = ${eventId}
        `;
        const decision = verifyPaypalEvent({
          enabled: true,
          eventId,
          eventType: String(body.event_type ?? ""),
          webhookId: request.headers.get("paypal-webhook-id") ?? String(body.webhook_id ?? ""),
          expectedWebhookId: process.env.PAYPAL_WEBHOOK_ID,
          transmissionSig: request.headers.get("paypal-transmission-sig"),
          planId,
          amount: amountObj.value as string | undefined,
          currency: amountObj.currency_code as string | undefined,
          payerId: String((resource.payer as { payer_id?: string } | undefined)?.payer_id ?? resource.payer_id ?? "webhook"),
          orderId: String(resource.id ?? ""),
          seen: Number(seenRows[0]?.c ?? 0) > 0,
        });
        if (!decision.ok) {
          return Response.json({ ok: false, reason: decision.reason }, { status: 400 });
        }
        await sql`
          insert into paypal_events (event_id, plan_id, status)
          values (${decision.eventId}, ${decision.planId}, 'verified')
        `;
        const tgId = Number(tgRaw);
        const plan = planById(decision.planId);
        if (!plan || !Number.isFinite(tgId) || tgId <= 0) {
          return Response.json({ ok: true, stored: true, granted: false });
        }
        const paid = await recordPayment(tgId, plan.stars, decision.eventId, true, plan.id);
        return Response.json({ ok: true, stored: true, granted: !paid.duplicate, duplicate: paid.duplicate });
      },
    },
  },
});
