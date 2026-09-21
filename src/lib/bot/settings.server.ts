import { getPublicOrigin, normalizeOrigin } from "./origin";
import {
  CHANNEL_USERNAME,
  DAILY_CAP,
  DAILY_CAP_ON,
  FREE_DOWNLOADS,
  GROK_MODELS,
  MONTHLY_CAP,
  MONTHLY_CAP_ON,
  TEMP_FREE,
  isGrokModel,
  isGrokSpeed,
  isOwnerId,
  type GrokModel,
  type GrokSpeed,
} from "./config.server";
import { channelUrl, normalizeChannel } from "./brand";
import type { Member } from "./store.server";
import { isSubscribed } from "./store.server";

export type BotSettings = {
  requiredChannel: string;
  freeDownloads: number;
  paused: boolean;
  adsEnabled: boolean;
  adsText: string;
  grokOwner: boolean;
  grokModel: GrokModel;
  grokSpeed: GrokSpeed;
  grokWebSearch: boolean;
  grokTools: boolean;
  restrictionsOn: boolean;
  dailyCapOn: boolean;
  publicOrigin: string;
  pornFilter: boolean;
  ownerExemptCustom: boolean;
};

export type DownloadAccess = {
  ok: boolean;
  remaining: number;
  subscribed: boolean;
  needJoin: boolean;
  paused: boolean;
  banned: boolean;
  channel: string;
  freeDownloads: number;
  monthlyUsed: number;
  monthlyCap: number;
  monthlyUnlimited: boolean;
};

function on(v: string | undefined): boolean {
  return v !== "off";
}

export async function botSettings(): Promise<BotSettings> {
  const { getSettings } = await import("./store.server");
  const raw = await getSettings();
  const free = Number(raw.free_downloads ?? FREE_DOWNLOADS);
  const model = isGrokModel(raw.grok_model ?? "") ? raw.grok_model : GROK_MODELS[0];
  const speed = isGrokSpeed(raw.grok_speed ?? "") ? raw.grok_speed : "balanced";
  return {
    requiredChannel: normalizeChannel(raw.required_channel) || CHANNEL_USERNAME,
    freeDownloads: Number.isFinite(free) && free >= 0 ? Math.min(50, Math.floor(free)) : FREE_DOWNLOADS,
    paused: raw.bot_paused === "on",
    adsEnabled: raw.ads_enabled === "on",
    adsText: (raw.ads_text ?? "").trim(),
    grokOwner: on(raw.grok_owner),
    grokModel: model as GrokModel,
    grokSpeed: speed as GrokSpeed,
    grokWebSearch: raw.grok_web_search === "on",
    grokTools: on(raw.grok_tools),
    restrictionsOn: raw.restrictions_on === "on",
    dailyCapOn: DAILY_CAP_ON || raw.daily_cap_on === "on",
    publicOrigin: getPublicOrigin() || normalizeOrigin(raw.public_origin),
    pornFilter: true,
    ownerExemptCustom: on(raw.owner_exempt_custom),
  };
}

export async function publicOrigin(): Promise<string> {
  const fromEnv = getPublicOrigin();
  if (fromEnv) return fromEnv;
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    if (host) return normalizeOrigin(`${proto}://${host.split(",")[0]!.trim()}`);
  } catch {
    /* no request context */
  }
  return "";
}

export async function isChannelMember(tgId: number | string, channel: string): Promise<boolean> {
  const handle = normalizeChannel(channel);
  if (!handle) return true;
  try {
    const { telegram } = await import("./telegram.server");
    const chat = handle.startsWith("-") ? handle : `@${handle}`;
    const member = await telegram.getChatMember(chat, Number(tgId));
    return ["creator", "administrator", "member", "restricted"].includes(member.status);
  } catch {
    return false;
  }
}

export async function channelProbe(channel: string): Promise<{ ok: boolean; error?: string }> {
  const handle = normalizeChannel(channel);
  if (!handle) return { ok: false, error: "القناة غير معيّنة" };
  try {
    const { telegram } = await import("./telegram.server");
    const { OWNER_TG_ID } = await import("./config.server");
    const chat = handle.startsWith("-") ? handle : `@${handle}`;
    await telegram.getChatMember(chat, Number(OWNER_TG_ID));
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذر الوصول للقناة";
    return { ok: false, error: message };
  }
}

export async function downloadAccess(member: Member): Promise<DownloadAccess> {
  const s = await botSettings();
  const owner = isOwnerId(member.tg_id);
  let monthlyUsed = 0;
  try {
    const { monthDownloadCount } = await import("./library.server");
    monthlyUsed = await monthDownloadCount(Number(member.tg_id));
  } catch {
    monthlyUsed = 0;
  }
  const base = {
    channel: s.requiredChannel,
    freeDownloads: s.freeDownloads,
    paused: s.paused,
    banned: Boolean(member.is_banned) && !owner,
    monthlyUsed,
    monthlyCap: MONTHLY_CAP,
    monthlyUnlimited: false,
  };
  const finish = (
    access: Omit<DownloadAccess, "monthlyUsed" | "monthlyCap" | "monthlyUnlimited"> & { monthlyUnlimited?: boolean },
  ): DownloadAccess => {
    const unlimited = Boolean(access.monthlyUnlimited) || access.subscribed || owner;
    const monthlyOk = unlimited || !MONTHLY_CAP_ON || monthlyUsed < MONTHLY_CAP;
    return {
      ...access,
      ok: access.ok && monthlyOk,
      monthlyUsed,
      monthlyCap: MONTHLY_CAP,
      monthlyUnlimited: unlimited,
    };
  };
  if (base.banned) {
    return finish({ ok: false, remaining: 0, subscribed: false, needJoin: false, ...base });
  }
  if (owner || member.is_admin) {
    return finish({
      ok: true,
      remaining: -1,
      subscribed: true,
      needJoin: false,
      ...base,
      paused: false,
      banned: false,
      monthlyUnlimited: true,
    });
  }
  if (isSubscribed(member)) {
    return finish({ ok: true, remaining: -1, subscribed: true, needJoin: false, ...base, monthlyUnlimited: true });
  }
  if (s.paused) {
    return finish({ ok: false, remaining: 0, subscribed: false, needJoin: false, ...base });
  }
  if (s.dailyCapOn || TEMP_FREE) {
    const { todayDownloads } = await import("./store.server");
    const used = await todayDownloads(member.tg_id);
    let remaining = Math.max(0, DAILY_CAP - used);
    if (remaining <= 0) {
      try {
        const { consumeBonusDownload } = await import("./product.server");
        if (await consumeBonusDownload(Number(member.tg_id))) remaining = 1;
      } catch {
        /* no bonus */
      }
    }
    return finish({
      ok: remaining > 0,
      remaining,
      subscribed: false,
      needJoin: false,
      ...base,
      paused: s.paused ? base.paused : false,
    });
  }
  if (!s.restrictionsOn) {
    return finish({ ok: true, remaining: -1, subscribed: false, needJoin: false, ...base });
  }
  if (s.requiredChannel) {
    const joined = await isChannelMember(member.tg_id, s.requiredChannel);
    if (!joined) {
      return finish({ ok: false, remaining: 0, subscribed: false, needJoin: true, ...base });
    }
  }
  const remaining = Math.max(0, s.freeDownloads - member.downloads_used);
  return finish({ ok: remaining > 0, remaining, subscribed: false, needJoin: false, ...base });
}

export function joinHref(channel: string): string {
  return channelUrl(channel);
}
