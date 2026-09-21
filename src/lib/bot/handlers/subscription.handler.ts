export async function handleSubscription(chatId: number, fromId: number) {
  const { sendPlanCatalog } = await import("../plans.server");
  await sendPlanCatalog(chatId, fromId);
}
