import { isOwnerId } from "./config.server";

export type Role = "owner" | "admin" | "moderator" | "support" | "user";
export type Tier = "free" | "pro" | "vip";

export type Permission =
  | "users.read"
  | "users.manage"
  | "users.unban"
  | "owners.manage"
  | "settings.write"
  | "logs.read"
  | "payments.manage"
  | "jobs.manage"
  | "jobs.retry"
  | "errors.read"
  | "reports.review"
  | "content.ban"
  | "tickets.read";

export const ROLE_RANK: Record<Role, number> = {
  owner: 40,
  admin: 30,
  moderator: 20,
  support: 10,
  user: 0,
};

const ALL_PERMISSIONS: Permission[] = [
  "users.read",
  "users.manage",
  "users.unban",
  "owners.manage",
  "settings.write",
  "logs.read",
  "payments.manage",
  "jobs.manage",
  "jobs.retry",
  "errors.read",
  "reports.review",
  "content.ban",
  "tickets.read",
];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(ALL_PERMISSIONS),
  admin: new Set(["users.read", "jobs.manage", "jobs.retry", "errors.read"]),
  moderator: new Set(["reports.review", "content.ban"]),
  support: new Set(["tickets.read"]),
  user: new Set(),
};

/** /ban /unban /appealok /appealno stay owner-only via these permissions. */
export const OWNER_ONLY_PERMISSIONS: readonly Permission[] = [
  "users.manage",
  "users.unban",
  "owners.manage",
  "settings.write",
  "logs.read",
  "payments.manage",
];

export function parseRole(raw?: string | null): Role {
  const v = (raw ?? "").toLowerCase().trim();
  if (v === "admin" || v === "support") return v;
  if (v === "moderator" || v === "mod") return "moderator";
  return "user";
}

export function parseTier(raw?: string | null): Tier {
  const v = (raw ?? "").toLowerCase();
  if (v === "vip" || v === "max") return "vip";
  if (v === "pro" || v === "plus") return "pro";
  return "free";
}

export function roleOfId(tgId: number | string, stored?: string | null): Role {
  if (isOwnerId(tgId)) return "owner";
  return parseRole(stored);
}

export function can(role: Role, action: Permission | "all"): boolean {
  if (role === "owner") return true;
  if (action === "all") return false;
  return MATRIX[role].has(action);
}

export function assertCan(role: Role, action: Permission): void {
  if (!can(role, action)) throw new Error("لا صلاحية");
}

export function permissionsOf(role: Role): Permission[] {
  return ALL_PERMISSIONS.filter((p) => can(role, p));
}

export function isStaff(role: Role): boolean {
  return role !== "user";
}

export function dailyLimitFor(tier: Tier, fallback = 5): number {
  if (tier === "vip") return -1;
  if (tier === "pro") return 40;
  return fallback;
}

export function queuePriority(tier: Tier): number {
  if (tier === "vip") return 0;
  if (tier === "pro") return 1;
  return 2;
}
