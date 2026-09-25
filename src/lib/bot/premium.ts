/** Enforced plan limits. Free download stays open. Paid extras apply only when the member is subscribed. */

export type TierName = "free" | "plus" | "pro" | "max";

export type Entitlements = {
  tier: TierName;
  dailyCap: number;
  monthlyCap: number;
  priority: number;
  maxFileMb: number;
  batchLinks: number;
  library: boolean;
  workspace: boolean;
  agentTurns: number;
  studio: boolean;
  analysis: boolean;
  prioritySupport: boolean;
};

const FREE: Entitlements = {
  tier: "free",
  dailyCap: 5,
  monthlyCap: 60,
  priority: 0,
  maxFileMb: 50,
  batchLinks: 1,
  library: false,
  workspace: false,
  agentTurns: 3,
  studio: false,
  analysis: false,
  prioritySupport: false,
};

const PLUS: Entitlements = {
  tier: "plus",
  dailyCap: 30,
  monthlyCap: 400,
  priority: 10,
  maxFileMb: 80,
  batchLinks: 3,
  library: true,
  workspace: false,
  agentTurns: 8,
  studio: false,
  analysis: false,
  prioritySupport: false,
};

const PRO: Entitlements = {
  tier: "pro",
  dailyCap: 50,
  monthlyCap: 800,
  priority: 20,
  maxFileMb: 100,
  batchLinks: 5,
  library: true,
  workspace: true,
  agentTurns: 20,
  studio: false,
  analysis: false,
  prioritySupport: true,
};

const MAX: Entitlements = {
  tier: "max",
  dailyCap: 200,
  monthlyCap: 3000,
  priority: 30,
  maxFileMb: 200,
  batchLinks: 5,
  library: true,
  workspace: true,
  agentTurns: 40,
  studio: true,
  analysis: true,
  prioritySupport: true,
};

export function entitlementsFor(tier: TierName): Entitlements {
  if (tier === "max") return MAX;
  if (tier === "pro") return PRO;
  if (tier === "plus") return PLUS;
  return FREE;
}

export function tierFromMember(raw?: string | null, subscribed = false): TierName {
  if (!subscribed) return "free";
  const id = (raw ?? "").toLowerCase();
  if (id === "max" || id === "vip") return "max";
  if (id === "pro") return "pro";
  if (id === "plus" || id === "season" || id === "sub") return "plus";
  return "free";
}

export function advertisedLines(ent: Entitlements): string[] {
  const lines = [`حد يومي ${ent.dailyCap}`, `حتى ${ent.batchLinks} روابط في الرسالة`];
  if (ent.priority > 0) lines.push("أولوية في الطابور");
  if (ent.library) lines.push("سجل التحميل");
  if (ent.workspace) lines.push("مساحة العمل");
  if (ent.analysis) lines.push("تحليل الفيديو");
  if (ent.studio) lines.push("تجهيز النشر");
  if (ent.prioritySupport) lines.push("دعم بأولوية");
  if (ent.agentTurns > FREE.agentTurns) lines.push(`وكيل حتى ${ent.agentTurns} خطوة/يوم`);
  return lines;
}
