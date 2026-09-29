import { createHash } from "node:crypto";
import { dbBackendLabel, flushDb, getSql } from "@/lib/db";
import {
  BOT_DESCRIPTION,
  BOT_DISPLAY_NAME,
  BOT_SHORT,
  BOT_USERNAME,
  CHANNEL_USERNAME,
  OWNER_IDS,
  webhookSecret,
} from "./config.server";
import { getPublicOrigin, webhookUrl } from "./origin";
import { getBotState, patchBotState } from "./state";
import { adminStats, ensurePaidGiftCodes, getSettings, grantDays, markAdmin, setSetting } from "./store.server";
import { ensureBotCommands, setMyAnimatedProfilePhoto, telegram } from "./telegram.server";

const g = globalThis as unknown as { __barqWebhookKey?: string; __barqProfileRev?: string };
const PROFILE_REV = "bolt-ar-4";

async function refreshPublicProfile(): Promise<void> {
  if (g.__barqProfileRev === PROFILE_REV) return;
  const errors: string[] = [];
  await telegram.setMyName(BOT_DISPLAY_NAME).catch((err) => {
    errors.push(err instanceof Error ? err.message : "name");
  });
  for (const language_code of [undefined, "ar"] as const) {
    await telegram.setMyDescription(BOT_DESCRIPTION, language_code).catch((err) => {
      errors.push(err instanceof Error ? err.message : "description");
    });
    await telegram.setMyShortDescription(BOT_SHORT, language_code).catch((err) => {
      errors.push(err instanceof Error ? err.message : "short");
    });
  }
  const origin = (getPublicOrigin() || "https://abdulrhman.ai").replace(/\/$/, "");
  try {
    const anim = await fetch(`${origin}/bot-intro.mp4`);
    if (!anim.ok) throw new Error(`intro ${anim.status}`);
    await setMyAnimatedProfilePhoto(await anim.blob(), "bot-intro.mp4");
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "photo");
    try {
      const still = await fetch(`${origin}/brand-mark.jpg`);
      if (!still.ok) throw new Error(`mark ${still.status}`);
      const { setMyProfilePhoto } = await import("./telegram.server");
      await setMyProfilePhoto(await still.blob(), "brand-mark.jpg");
    } catch (stillErr) {
      errors.push(stillErr instanceof Error ? stillErr.message : "still");
    }
  }
  if (errors.length) console.error(`barq profile: ${errors.join(" | ")}`);
  else g.__barqProfileRev = PROFILE_REV;
}

export async function ensureWebhook(url = webhookUrl()): Promise<string> {
  const secret = webhookSecret();
  if (!secret) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET is required");
  }
  const fp = createHash("sha256").update(secret, "utf8").digest("hex").slice(0, 12);
  const key = `${url}#${fp}`;
  if (g.__barqWebhookKey !== key) {
    await telegram.setWebhook(url, secret);
    g.__barqWebhookKey = key;
    void import("./vault.server")
      .then((m) => {
        void m.rememberVaultChat("-1003973499061", "برق ⚡️ | سري");
        return m.probeAndBindVault();
      })
      .catch(() => undefined);
    try {
      await setSetting("webhook_url", url);
      await setSetting("public_origin", getPublicOrigin());
    } catch {
      /* db not ready yet */
    }
  }
  await refreshPublicProfile();
  await ensureBotCommands().catch((err) => {
    console.error("barq commands", err instanceof Error ? err.message : err);
  });
  patchBotState({
    running: true,
    mode: "webhook",
    lastOkAt: Date.now(),
    lastError: null,
    username: BOT_USERNAME,
    displayName: BOT_DISPLAY_NAME,
  });
  try {
    await setSetting("webhook_url", url);
    await setSetting("public_origin", getPublicOrigin());
  } catch {
    /* db not ready yet */
  }
  return url;
}

export type BotHealth = ReturnType<typeof getBotState> & {
  db: string;
  dbError: string | null;
  webhook: string;
  vercel: boolean;
};

export async function botHealth(): Promise<BotHealth> {
  let db = dbBackendLabel();
  let dbError: string | null = null;
  let members = 0;
  try {
    const sql = await getSql();
    await sql`select 1 as ok`;
    const stats = await adminStats();
    members = stats.members;
    await setSetting("last_heartbeat", new Date().toISOString());
    const settings = await getSettings();
    if (!String(settings.required_channel ?? "").trim()) {
      await setSetting("required_channel", CHANNEL_USERNAME);
    }
    await ensurePaidGiftCodes().catch(() => undefined);
    const { ensurePrivileges } = await import("./store.server");
    await ensurePrivileges().catch(() => undefined);
    const { moderatorNotice, notifyOnce, planNotice } = await import("./gift-notice.server");
    await notifyOnce("notice_vip_5059912532_v2", "5059912532", planNotice(365)).catch(() => undefined);
    await notifyOnce("notice_mod_8942297498_v2", "8942297498", moderatorNotice()).catch(() => undefined);
    for (const id of OWNER_IDS) {
      await markAdmin(id).catch(() => undefined);
      await grantDays(id, 3650).catch(() => undefined);
    }
  } catch (err) {
    db = "error";
    dbError = err instanceof Error ? err.message : "db failed";
    patchBotState({ lastError: dbError });
  }

  let webhook = "";
  try {
    webhook = await ensureWebhook();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "webhook failed";
    dbError = dbError ? `${dbError}; ${msg}` : msg;
    patchBotState({ lastError: msg });
  }

  try {
    const { runHourlyAds } = await import("./ads.server");
    await runHourlyAds();
  } catch {
    /* ads are best-effort */
  }

  patchBotState({
    members,
    running: !dbError,
    mode: "webhook",
    lastOkAt: Date.now(),
    username: BOT_USERNAME,
    displayName: BOT_DISPLAY_NAME,
  });

  await flushDb().catch(() => undefined);

  return {
    ...getBotState(),
    db,
    dbError,
    webhook,
    vercel: Boolean(process.env.VERCEL),
  };
}
