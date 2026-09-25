import {
  callsForIntent,
  needsConfirmation,
  parseAgentIntent,
  type AgentToolCall,
  type AgentToolResult,
} from "./agent-protocol";
import { executeAgentTool } from "./agent-tools.server";
import { loadPendingTool, recordAgentStep, savePendingTool } from "./agent-state.server";

export type AgentTurn = {
  text: string;
  ok: boolean;
  results: AgentToolResult[];
  awaitingConfirmation: boolean;
};

function summarize(results: AgentToolResult[]): string {
  if (results.length === 0) {
    return "أرسل رابطًا لأفحصه، أو اكتب حمّل ثم الرابط. التحميل ما يبدأ إلا بعد التأكيد.";
  }
  return results
    .map((result) => {
      if (!result.ok) return result.error || "ما اكتملت الخطوة.";
      if (result.name === "inspect_url") {
        return `المنصة: ${String(result.data?.platform ?? "غير معروفة")}. أكتب «حمّل» والرابط إذا تبيه.`;
      }
      if (result.name === "start_download" && result.jobId) {
        return `انضاف التحميل. رقم المهمة ${result.jobId}. الحالة: ${String(result.data?.status ?? "pending")}.`;
      }
      if (result.name === "list_jobs") {
        const jobs = (result.data?.jobs as { id: string; status: string }[] | undefined) ?? [];
        if (!jobs.length) return "ما عندك مهام مفتوحة.";
        return jobs.map((job) => `${job.id}: ${job.status}`).join("\n");
      }
      if (result.name === "read_library") return "هذا سجل تحميلاتك.";
      if (result.jobId) return `المهمة ${result.jobId}: ${String(result.data?.status ?? "")}`;
      return "تمت الخطوة.";
    })
    .join("\n");
}

export async function runAgentTurn(input: {
  tgId: number;
  text: string;
  chatId?: number;
  subscribed?: boolean;
  tier?: string | null;
}): Promise<AgentTurn> {
  const intent = parseAgentIntent(input.text);
  const pending = intent.kind === "confirm" ? await loadPendingTool(input.tgId) : null;
  const calls = callsForIntent(intent, pending);
  if (intent.kind === "confirm" && !pending) {
    return { text: "ما فيه إجراء معلّق.", ok: false, results: [], awaitingConfirmation: false };
  }

  const gated = calls.filter((call) => needsConfirmation(call.name) && intent.kind !== "confirm");
  if (gated[0]) {
    await savePendingTool(input.tgId, gated[0], "بانتظار التأكيد").catch(() => undefined);
    return {
      text: "هذا الإجراء يحتاج تأكيد. أرسل «تأكيد» للمتابعة، وما أبدأه قبلها.",
      ok: false,
      results: [],
      awaitingConfirmation: true,
    };
  }

  const results: AgentToolResult[] = [];
  for (const call of calls) {
    const result = await executeAgentTool({
      tgId: input.tgId,
      call,
      chatId: input.chatId,
      subscribed: input.subscribed,
      tier: input.tier,
    });
    results.push(result);
    await recordAgentStep(input.tgId, call, result).catch(() => undefined);
  }
  if (intent.kind === "confirm") {
    await savePendingTool(input.tgId, null, summarize(results)).catch(() => undefined);
  }
  const ok = results.length > 0 && results.every((result) => result.ok);
  return { text: summarize(results), ok, results, awaitingConfirmation: false };
}

export function pendingCall(call: AgentToolCall | null): AgentToolCall | null {
  return call;
}
