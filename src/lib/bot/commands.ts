export const COMMANDS = {
  start: "start",
  help: "help",
  account: "account",
  points: "points",
  invite: "invite",
  live: "live",
  ai: "ai",
  short: "short",
  sub: "sub",
  history: "history",
  quota: "quota",
  support: "support",
} as const;

export function matchCommand(text: string): string | null {
  const m = /^\/([a-zA-Z]+)(?:@\w+)?(?:\s|$)/.exec(text.trim());
  if (!m) return null;
  const name = m[1]!.toLowerCase();
  return name in COMMANDS ? name : null;
}
