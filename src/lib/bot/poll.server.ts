import { BOT_DESCRIPTION, BOT_DISPLAY_NAME, BOT_SHORT, BOT_USERNAME } from "./config.server";
import { markError, patchBotState } from "./state";
import { ensureBotCommands, telegram } from "./telegram.server";

/**
 * Unused in preview — the standalone `scripts/telegram-bot.mjs` owns polling
 * so Vite HMR cannot kill the long-poll loop. Kept for webhook-less deploys
 * that explicitly import startPolling.
 */
const g = globalThis as unknown as {
  __barqPollLoop?: Promise<void>;
};

export function startPolling() {
  if (g.__barqPollLoop) return;
  patchBotState({
    running: true,
    mode: "polling",
    username: BOT_USERNAME,
    displayName: BOT_DISPLAY_NAME,
  });
  g.__barqPollLoop = loop();
}

async function loop() {
  try {
    await telegram.deleteWebhook();
    const me = await telegram.getMe();
    patchBotState({
      running: true,
      mode: "polling",
      username: me.username ?? BOT_USERNAME,
      displayName: me.first_name ?? BOT_DISPLAY_NAME,
      lastOkAt: Date.now(),
      lastError: null,
    });
  } catch (err) {
    markError(err instanceof Error ? err.message : "getMe failed");
  }

  await telegram.setMyName(BOT_DISPLAY_NAME);
  await telegram.setMyDescription(BOT_DESCRIPTION);
  await telegram.setMyShortDescription(BOT_SHORT);
  await ensureBotCommands();

  let offset = 0;
  for (;;) {
    try {
      const updates = await telegram.getUpdates(offset, 25);
      patchBotState({ lastOkAt: Date.now(), lastError: null, running: true, mode: "polling" });
      if (updates.length) {
        const { handleUpdate } = await import("./handle.server");
        for (const update of updates) {
          offset = update.update_id + 1;
          void handleUpdate(update).catch((err) => {
            markError(err instanceof Error ? err.message : "update failed");
          });
        }
      }
    } catch (err) {
      markError(err instanceof Error ? err.message : "polling failed");
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
}
