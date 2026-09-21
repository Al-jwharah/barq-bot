import { decideHostfile } from "./handle-guards";

export type Intent =
  | "download"
  | "upload"
  | "ai"
  | "live"
  | "account"
  | "points"
  | "subscription"
  | "short"
  | "start"
  | "help"
  | "command"
  | "other";

const START = new Set(["/start", "القائمة", "بدء"]);
const AI = new Set(["barq ai", "/ai", "جروك", "/grok"]);
const LIVE = new Set(["/live", "البث", "live recorder"]);
const ACCOUNT = new Set(["حسابي", "/account", "سجلي", "/history", "سجل التحميل"]);
const POINTS = new Set(["نقاطي", "/points"]);
const SUB = new Set(["الاشتراك", "اشترك الآن", "تجديد الاشتراك", "/sub", "حالة الاشتراك"]);
const SHORT = new Set(["رابط مؤقت", "رابط مختصر 24س", "اشغله", "/short"]);
const HELP = new Set(["كيف يعمل", "/help"]);

function norm(text: string): string {
  return text.trim().toLowerCase();
}

export function classifyIntent(input: {
  text: string;
  urls: string[];
  hasFile: boolean;
  pending?: string;
}): Intent {
  const text = input.text.trim();
  const n = norm(text);
  if (input.pending === "hostfile") {
    const d = decideHostfile({ text, hasUrl: input.urls.length > 0, hasFile: input.hasFile });
    if (d === "download") return "download";
    if (d === "upload") return "upload";
  }
  if (input.urls.length > 0) return "download";
  if (input.hasFile) return "upload";
  if ([...START].some((s) => n === s.toLowerCase() || n.startsWith("/start"))) return "start";
  if (n.startsWith("/ai") || AI.has(n)) return "ai";
  if (n.startsWith("/live") || LIVE.has(n)) return "live";
  if (n.startsWith("/account") || n.startsWith("/history") || ACCOUNT.has(n)) return "account";
  if (n.startsWith("/points") || POINTS.has(n)) return "points";
  if (n.startsWith("/sub") || SUB.has(n)) return "subscription";
  if (n.startsWith("/short") || SHORT.has(n)) return "short";
  if (n.startsWith("/help") || HELP.has(n)) return "help";
  if (n.startsWith("/")) return "command";
  return "other";
}
