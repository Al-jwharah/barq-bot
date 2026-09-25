/** Public agent tools. Admin tools are not in this list and are rejected. */

export const PUBLIC_AGENT_TOOLS = [
  "inspect_url",
  "start_download",
  "job_status",
  "list_jobs",
  "read_library",
  "analyze_video",
] as const;

export type PublicAgentTool = (typeof PUBLIC_AGENT_TOOLS)[number];

export const CONFIRM_TOOLS = new Set<PublicAgentTool>(["start_download", "analyze_video"]);

export const BLOCKED_AGENT_TOOLS = [
  "grant_days",
  "set_subscription",
  "ban_user",
  "unban_user",
  "create_code",
  "set_setting",
  "broadcast",
  "change_plan",
  "add_points",
] as const;

export type AgentToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AgentToolResult = {
  ok: boolean;
  name: string;
  error?: string;
  jobId?: string;
  data?: Record<string, unknown>;
};

export function isPublicAgentTool(name: string): name is PublicAgentTool {
  return (PUBLIC_AGENT_TOOLS as readonly string[]).includes(name);
}

export function needsConfirmation(name: string): boolean {
  return isPublicAgentTool(name) && CONFIRM_TOOLS.has(name);
}

export type AgentIntent =
  | { kind: "inspect"; url: string }
  | { kind: "download"; url: string }
  | { kind: "status"; jobId?: string }
  | { kind: "jobs" }
  | { kind: "library" }
  | { kind: "analyze"; url: string }
  | { kind: "confirm" }
  | { kind: "chat" };

const URL_RE = /https?:\/\/[^\s]+/i;

export function parseAgentIntent(text: string): AgentIntent {
  const raw = text.trim();
  const url = raw.match(URL_RE)?.[0]?.replace(/[)\].,]+$/, "") ?? "";
  if (/^(تأكيد|اكد|أكد|confirm)$/i.test(raw)) return { kind: "confirm" };
  if (/مهام|طابور|jobs/i.test(raw) && !url) return { kind: "jobs" };
  if (/مكتب|سجل|library/i.test(raw) && !url) return { kind: "library" };
  if (url && /حلل|تحليل|analyze/i.test(raw)) return { kind: "analyze", url };
  if (url && /حمل|نزّل|نزل|download/i.test(raw)) return { kind: "download", url };
  if (url) return { kind: "inspect", url };
  if (/حالة|status/i.test(raw)) {
    const jobId = raw.match(/\b[a-f0-9]{8,}\b/i)?.[0];
    return { kind: "status", jobId };
  }
  return { kind: "chat" };
}

export function callsForIntent(intent: AgentIntent, pending?: AgentToolCall | null): AgentToolCall[] {
  if (intent.kind === "confirm") {
    if (!pending) return [];
    return [pending];
  }
  if (intent.kind === "inspect") {
    return [{ id: "inspect", name: "inspect_url", arguments: { url: intent.url } }];
  }
  if (intent.kind === "download") {
    return [{ id: "download", name: "start_download", arguments: { url: intent.url } }];
  }
  if (intent.kind === "analyze") {
    return [{ id: "analyze", name: "analyze_video", arguments: { url: intent.url } }];
  }
  if (intent.kind === "jobs" || intent.kind === "status") {
    return [{ id: "jobs", name: intent.kind === "status" && intent.jobId ? "job_status" : "list_jobs", arguments: intent.kind === "status" && intent.jobId ? { jobId: intent.jobId } : {} }];
  }
  if (intent.kind === "library") {
    return [{ id: "library", name: "read_library", arguments: {} }];
  }
  return [];
}
