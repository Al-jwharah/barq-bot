import { SUBSCRIPTIONS_LIVE, TEMP_FREE, isOwnerId } from "./config.server";
import { inlineKeyboard, telegram } from "./telegram.server";
import {
  MAX_PLAN,
  PLUS_PLAN,
  PRO_PLAN,
  SEASON_PLAN,
  catalogText,
  parseSubPayload,
  planById,
  subInvoicePayload,
  type PlanId,
  type SubPlan,
} from "./plans";
import { isSubscribed, type Member } from "./store.server";

/** Public charging stays off until both flags say go. */
export function subscriptionsLive(): boolean {
  return !TEMP_FREE && SUBSCRIPTIONS_LIVE;
}

export function memberPlan(member: Member | null | undefined): SubPlan | undefined {
  if (!member || !isSubscribed(member)) return undefined;
  return planById(member.tier);
}

export function canUseYoutube(member: Member | null | undefined, fromId?: number): boolean {
  if (!subscriptionsLive()) return true;
  if (fromId != null && isOwnerId(fromId)) return true;
  if (member && isOwnerId(member.tg_id)) return true;
  return Boolean(memberPlan(member)?.youtube);
}

export function canUseAi(member: Member | null | undefined, fromId?: number): boolean {
  if (!subscriptionsLive()) return true;
  if (fromId != null && isOwnerId(fromId)) return true;
  if (member && isOwnerId(member.tg_id)) return true;
  return Boolean(memberPlan(member)?.ai);
}

export async function sendPlanCatalog(chatId: number, fromId: number) {
  const rows = [
    [{ text: `${PLUS_PLAN.title} · ${PLUS_PLAN.stars}★`, callback_data: "go:sub:plus" }],
    [{ text: `${PRO_PLAN.title} · ${PRO_PLAN.stars}★`, callback_data: "go:sub:pro" }],
    [{ text: `${MAX_PLAN.title} · ${MAX_PLAN.stars}★`, callback_data: "go:sub:max" }],
    [{ text: `${SEASON_PLAN.title} · وفّر 20%`, callback_data: "go:sub:season" }],
  ];
  await telegram.sendMessage(chatId, catalogText(true), {
    reply_markup: inlineKeyboard(rows),
  });
}

export async function sendPlanInvoice(chatId: number, fromId: number, planId: PlanId) {
  const plan = SUB_PLAN(planId);
  await telegram.sendInvoice(chatId, {
    title: plan.title,
    description: `${plan.blurb}\n${plan.sar} ريال = ${plan.stars} نجمة · ${plan.days} يوم`,
    payload: subInvoicePayload(plan.id, fromId),
    provider_token: "",
    currency: "XTR",
    prices: [{ label: plan.title, amount: plan.stars }],
  });
}

function SUB_PLAN(id: PlanId): SubPlan {
  return planById(id) ?? PLUS_PLAN;
}

export function planFromPayment(payload: string, stars: number): SubPlan {
  const id = parseSubPayload(payload);
  if (id) return SUB_PLAN(id);
  if (stars >= MAX_PLAN.stars) return MAX_PLAN;
  return PLUS_PLAN;
}

export function youtubeLockedText(): string {
  return `يوتيوب ضمن ${MAX_PLAN.title} (${MAX_PLAN.sar} ريال = ${MAX_PLAN.stars} نجمة / شهر).\nبلس للتيك توك والإنستغرام والإكس.`;
}

export function aiLockedText(): string {
  return `Barq AI ضمن ${MAX_PLAN.title} (${MAX_PLAN.sar} ريال = ${MAX_PLAN.stars} نجمة / شهر).`;
}
