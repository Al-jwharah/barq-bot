import { createServerFn } from "@tanstack/react-start";
import { grokReady } from "./grok.server";
import { isGrokModel, isGrokSpeed, isOwnerId } from "./config.server";
import { normalizeChannel } from "./brand";
import { ADMIN_COOKIE, loginWithPin, logoutAdmin, mintCsrf, requireAdminMutation, requireAdminSession } from "./admin-session.server";
import { requireWeb } from "./acl.server";
import { can, type Permission } from "./roles.server";

async function gated(permission: Permission) {
  await requireAdminMutation();
  await requireWeb(permission);
  return import("./store.server");
}

async function audit(action: string, target?: string, detail?: string) {
  const { logAudit } = await import("./observability.server");
  await logAudit({ action, target, detail });
}

export const adminLogin = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const pin = typeof data === "object" && data && "pin" in data ? String((data as { pin: unknown }).pin ?? "") : "";
    if (pin.trim().length < 4) throw new Error("أدخل الرمز");
    return { pin: pin.trim() };
  })
  .handler(async ({ data }) => {
    await loginWithPin(data.pin);
    return { ok: true };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  await logoutAdmin();
  return { ok: true };
});

export const loadAdmin = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdminSession();
  const { getCookie } = await import("@tanstack/react-start/server");
  const csrf = mintCsrf(getCookie(ADMIN_COOKIE) ?? "");
  const role = "owner";
  const store = await import("./store.server");
  const { botSettings } = await import("./settings.server");
  const { listJobs, jobStats } = await import("../jobs/queue.server");
  const { listFeedback } = await import("./growth.server");
  const [stats, members, logs, codes, blocked, settings, clips, parsed, jobs, jobCounts, auditRows, tickets] =
    await Promise.all([
      store.adminStats(),
      can(role, "users.read") ? store.listMembers() : Promise.resolve([]),
      can(role, "logs.read") ? store.listLogs() : Promise.resolve([]),
      can(role, "payments.manage") ? store.listCodes() : Promise.resolve([]),
      can(role, "reports.review") || can(role, "logs.read") ? store.listFilterEvents(40) : Promise.resolve([]),
      store.getSettings(),
      store.listClips(40),
      botSettings(),
      can(role, "jobs.manage") || can(role, "errors.read") ? listJobs(40) : Promise.resolve([]),
      can(role, "jobs.manage") || can(role, "errors.read") ? jobStats() : Promise.resolve(null),
      can(role, "logs.read") ? store.listAudit(30) : Promise.resolve([]),
      can(role, "tickets.read") ? listFeedback(40) : Promise.resolve([]),
    ]);
  const { analyticsSnapshot } = await import("./growth.server");
  const growth = await analyticsSnapshot().catch(() => null);
  const successRate =
    stats.downloads + stats.failed > 0
      ? Math.round((stats.downloads / (stats.downloads + stats.failed)) * 100)
      : 100;
  return {
    stats: { ...stats, successRate },
    members,
    logs,
    codes,
    blocked,
    settings,
    clips,
    parsed,
    grok: grokReady(),
    jobs,
    jobCounts,
    audit: auditRows,
    growth,
    tickets,
    role,
    csrf,
  };
});

export const adminCreateCode = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const body = data as { code?: unknown; days?: unknown; maxUses?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const days = Number(body.days);
    const maxUses = Number(body.maxUses);
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(code)) throw new Error("الكود 3–24 حرفًا لاتينيًا أو رقمًا");
    if (!Number.isFinite(days) || days < 1 || days > 365) throw new Error("عدد الأيام غير صالح");
    if (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 10000) {
      throw new Error("عدد الاستخدامات غير صالح");
    }
    return { code, days, maxUses };
  })
  .handler(async ({ data }) => {
    const store = await gated("payments.manage");
    const code = await store.createCode(data.code, data.days, data.maxUses);
    await audit("create_code", data.code, `${data.days}d x${data.maxUses}`);
    return { code };
  });

export const adminSetCodeActive = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const body = data as { code?: unknown; active?: unknown };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) throw new Error("الكود مفقود");
    return { code, active: Boolean(body.active) };
  })
  .handler(async ({ data }) => {
    const store = await gated("payments.manage");
    await store.setCodeActive(data.code, data.active);
    await audit("set_code_active", data.code, String(data.active));
    return { ok: true };
  });

export const adminGrant = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const body = data as { tgId?: unknown; days?: unknown };
    const tgId = typeof body.tgId === "string" ? body.tgId.trim() : String(body.tgId ?? "");
    const days = Number(body.days);
    if (!/^\d{3,20}$/.test(tgId)) throw new Error("معرّف تليجرام غير صالح");
    if (!Number.isFinite(days) || days < 0 || days > 365) throw new Error("عدد الأيام غير صالح");
    return { tgId, days };
  })
  .handler(async ({ data }) => {
    const store = await gated("payments.manage");
    if (data.days === 0) await store.setSubscriptionDays(data.tgId, 0);
    else await store.grantDays(data.tgId, data.days);
    await audit("grant", data.tgId, String(data.days));
    return { ok: true };
  });

export const adminSetSubscription = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const body = data as { tgId?: unknown; days?: unknown };
    const tgId = typeof body.tgId === "string" ? body.tgId.trim() : String(body.tgId ?? "");
    const days = Number(body.days);
    if (!/^\d{3,20}$/.test(tgId)) throw new Error("معرّف تليجرام غير صالح");
    if (!Number.isFinite(days) || days < 0 || days > 365) throw new Error("عدد الأيام غير صالح");
    return { tgId, days };
  })
  .handler(async ({ data }) => {
    const store = await gated("payments.manage");
    await store.setSubscriptionDays(data.tgId, data.days);
    await audit("set_subscription", data.tgId, String(data.days));
    return { ok: true };
  });

export const adminBroadcast = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const body = data as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 1 || text.length > 3500) throw new Error("النص 1–3500 حرف");
    return { text };
  })
  .handler(async ({ data }) => {
    const store = await gated("settings.write");
    const { telegram } = await import("./telegram.server");
    const ids = await store.memberIds();
    let sent = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await telegram.sendMessage(Number(id), data.text);
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    await audit("broadcast", undefined, `sent=${sent} failed=${failed}`);
    return { sent, failed, total: ids.length };
  });

const TOGGLE_KEYS = new Set([
  "owner_exempt_custom",
  "porn_filter",
  "bot_paused",
  "ads_enabled",
  "grok_owner",
  "grok_web_search",
  "grok_tools",
  "restrictions_on",
]);

export const adminSetSetting = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const body = data as { key?: unknown; value?: unknown };
    const key = typeof body.key === "string" ? body.key.trim() : "";
    let value = typeof body.value === "string" ? body.value.trim() : "";
    if (key === "porn_filter") {
      return { key, value: "off" };
    }
    if (TOGGLE_KEYS.has(key)) {
      if (value !== "on" && value !== "off") throw new Error("القيمة on أو off");
      return { key, value };
    }
    if (key === "required_channel") {
      value = normalizeChannel(value);
      return { key, value };
    }
    if (key === "free_downloads") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 50) throw new Error("العدد 0–50");
      return { key, value: String(Math.floor(n)) };
    }
    if (key === "grok_model") {
      if (!isGrokModel(value)) throw new Error("نموذج غير معروف");
      return { key, value };
    }
    if (key === "grok_speed") {
      if (!isGrokSpeed(value)) throw new Error("سرعة غير معروفة");
      return { key, value };
    }
    if (key === "ads_text" || key === "public_origin") {
      return { key, value: value.slice(0, 1000) };
    }
    throw new Error("إعداد غير معروف");
  })
  .handler(async ({ data }) => {
    const store = await gated("settings.write");
    await store.setSetting(data.key, data.value);
    await audit("set_setting", data.key, data.value.slice(0, 80));
    return { ok: true };
  });

export const adminBan = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const body = data as { tgId?: unknown; banned?: unknown };
    const tgId = String(body.tgId ?? "").trim();
    if (!/^\d{3,20}$/.test(tgId)) throw new Error("معرّف غير صالح");
    return { tgId, banned: body.banned !== false };
  })
  .handler(async ({ data }) => {
    await requireAdminMutation();
    await requireWeb(data.banned ? "users.manage" : "users.unban");
    if (isOwnerId(data.tgId)) throw new Error("لا يمكن حظر المالك");
    const store = await import("./store.server");
    if (data.banned) await store.banUser(data.tgId);
    else await store.unbanUser(data.tgId);
    await audit(data.banned ? "ban" : "unban", data.tgId);
    return { ok: true };
  });

export const adminSetRole = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const body = data as { tgId?: unknown; role?: unknown };
    const tgId = String(body.tgId ?? "").trim();
    const roleRaw = String(body.role ?? "user").toLowerCase().trim();
    const role = roleRaw === "mod" ? "moderator" : roleRaw;
    if (!/^\d{3,20}$/.test(tgId)) throw new Error("معرّف غير صالح");
    if (!["admin", "moderator", "support", "user"].includes(role)) throw new Error("دور غير صالح");
    return { tgId, role };
  })
  .handler(async ({ data }) => {
    const store = await gated("owners.manage");
    if (isOwnerId(data.tgId)) throw new Error("لا يمكن تعديل دور المالك");
    await store.setMemberRole(data.tgId, data.role);
    await audit("set_role", data.tgId, data.role);
    return { ok: true };
  });

export const adminRetryJob = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const id = String((data as { id?: unknown }).id ?? "").trim();
    if (!/^[a-f0-9]{12,64}$/i.test(id) && !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      throw new Error("معرّف المهمة غير صالح");
    }
    return { id };
  })
  .handler(async ({ data }) => {
    await requireAdminMutation();
    await requireWeb("jobs.retry");
    const { retryJobById } = await import("../jobs/queue.server");
    const job = await retryJobById(data.id);
    await audit("job_retry", data.id, job.status);
    return { ok: true, id: job.id, status: job.status };
  });
