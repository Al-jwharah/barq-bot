import { requireAdminSession } from "./admin-session.server";
import { assertCan, isStaff, parseRole, roleOfId, type Permission, type Role } from "./roles.server";

export { type Permission, type Role };

const CALLBACK_PERM: Record<string, Permission> = {
  "adm:home": "users.read",
  "adm:pause": "settings.write",
  "adm:run": "settings.write",
  "adm:ads": "settings.write",
  "adm:ads_open": "settings.write",
  "adm:ads_txt": "settings.write",
  "adm:bc": "settings.write",
  "adm:codes": "payments.manage",
  "adm:subs": "payments.manage",
  "adm:code_new": "payments.manage",
  "adm:code_off": "payments.manage",
  "adm:grant": "payments.manage",
  "adm:edit": "payments.manage",
  "adm:grok": "settings.write",
  "adm:grok_on": "settings.write",
  "adm:g_chat": "settings.write",
  "adm:g_tools": "settings.write",
  "adm:g_web": "settings.write",
  "adm:m45": "settings.write",
  "adm:m4": "settings.write",
  "adm:m3": "settings.write",
  "adm:s_fast": "settings.write",
  "adm:s_bal": "settings.write",
  "adm:s_deep": "settings.write",
  "adm:sys": "settings.write",
  "adm:rest": "settings.write",
  "adm:cap": "settings.write",
  "adm:wipe": "owners.manage",
  "adm:wipe_ok": "owners.manage",
  "adm:ch": "settings.write",
  "adm:ch_set": "settings.write",
  "adm:ch_n": "settings.write",
  "adm:ch_clr": "settings.write",
  "adm:news": "settings.write",
  "adm:contest": "settings.write",
  "adm:draw": "settings.write",
  "adm:stat": "errors.read",
  "adm:likes": "logs.read",
  "adm:watch": "errors.read",
  "adm:jobs": "jobs.manage",
  "adm:retry": "jobs.retry",
  "adm:reports": "reports.review",
  "adm:tickets": "tickets.read",
};

const GROK_TOOL_PERM: Record<string, Permission> = {
  get_stats: "logs.read",
  list_recent_downloads: "logs.read",
  list_blocked: "reports.review",
  create_code: "payments.manage",
  deactivate_code: "payments.manage",
  grant_days: "payments.manage",
  ban_user: "users.manage",
  unban_user: "users.unban",
  set_subscription: "payments.manage",
  broadcast: "settings.write",
  set_setting: "settings.write",
  draw_contest: "settings.write",
  list_contests: "logs.read",
  copy_last_media_to_channel: "settings.write",
};

/** Telegram slash commands. /ban /unban /appealok /appealno are owner-only. */
const COMMAND_PERM: Record<string, Permission> = {
  "/ban": "users.manage",
  "/unban": "users.unban",
  "/appealok": "users.unban",
  "/appealno": "users.unban",
  "/appeals": "users.unban",
};

export const OWNER_ONLY_COMMANDS = ["/ban", "/unban", "/appealok", "/appealno"] as const;

export async function actorRole(tgId: number | string): Promise<Role> {
  if (roleOfId(tgId) === "owner") return "owner";
  const store = await import("./store.server");
  const member = await store.getMember(tgId);
  return roleOfId(tgId, member?.role ?? (member?.is_admin ? "admin" : "user"));
}

export async function requireActor(tgId: number | string, permission: Permission): Promise<Role> {
  const role = await actorRole(tgId);
  assertCan(role, permission);
  return role;
}

export async function requireWeb(permission: Permission): Promise<Role> {
  await requireAdminSession();
  assertCan("owner", permission);
  return "owner";
}

export function permForCallback(data: string): Permission | null {
  const key = data.split(":")[0] === "adm" ? data.split(":").slice(0, 2).join(":") : data;
  if (CALLBACK_PERM[data]) return CALLBACK_PERM[data];
  if (CALLBACK_PERM[key]) return CALLBACK_PERM[key];
  if (data.startsWith("adm:")) return "settings.write";
  return null;
}

export function permForGrokTool(name: string): Permission | null {
  return GROK_TOOL_PERM[name] ?? null;
}

export function permForCommand(cmd: string): Permission | null {
  const key = cmd.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return COMMAND_PERM[key] ?? null;
}

export function staffRole(raw?: string | null, tgId?: number | string): Role {
  if (tgId != null) return roleOfId(tgId, raw);
  return parseRole(raw);
}

export { isStaff };
