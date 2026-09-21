export function workersForLoad(pending: number, cap = 8): number {
  const max = Number.isFinite(cap) && cap > 0 ? Math.min(8, Math.trunc(cap)) : 8;
  if (pending <= 0) return 1;
  if (pending <= 4) return Math.min(2, max);
  if (pending <= 15) return Math.min(3, max);
  if (pending <= 40) return Math.min(5, max);
  return max;
}

export function queuePriorityFor(input: { owner?: boolean; tier?: string; subscribed?: boolean }): number {
  if (input.owner) return 9;
  const tier = (input.tier ?? "").toLowerCase();
  if (tier === "vip" || tier === "max") return 5;
  if (tier === "pro") return 3;
  if (input.subscribed || tier === "plus") return 2;
  return 0;
}
