import { COFFEE_STARS, COFFEE_TIP_STARS, COFFEE_TITLE } from "./config.server";
import { telegram } from "./telegram.server";

export async function sendCoffeeInvoice(chatId: number, stars: number = COFFEE_TIP_STARS) {
  const amount = COFFEE_STARS.includes(stars as (typeof COFFEE_STARS)[number])
    ? stars
    : COFFEE_TIP_STARS;
  await telegram.sendInvoice(chatId, {
    title: COFFEE_TITLE,
    description: `${amount} نجمة`,
    payload: `tip:${chatId}:${amount}:${Date.now()}`,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: COFFEE_TITLE, amount }],
  });
}

export async function sendCoffeeAsk(chatId: number) {
  await sendCoffeeInvoice(chatId, COFFEE_TIP_STARS);
}

export async function sendStarPicker(chatId: number) {
  await sendCoffeeInvoice(chatId, COFFEE_TIP_STARS);
}
