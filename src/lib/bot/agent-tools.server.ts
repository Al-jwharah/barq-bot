import { permForGrokTool, actorRole } from "./acl.server";
import { assertCan, type Role } from "./roles.server";
import {
  BLOCKED_AGENT_TOOLS,
  isPublicAgentTool,
  type AgentToolCall,
  type AgentToolResult,
} from "./agent-protocol";
import { entitlementsFor, tierFromMember } from "./premium";
import { assertSafeOutboundUrl, SsrfError } from "../media/ssrf";
import { detectPlatform } from "../media/urls";

const ADMIN_TOOLS = new Set<string>(BLOCKED_AGENT_TOOLS);

export function assertAgentMayRun(role: Role, tool: string): void {
  if (ADMIN_TOOLS.has(tool) || !isPublicAgentTool(tool)) {
    const perm = permForGrokTool(tool);
    if (!perm) throw new Error("forbidden_tool");
    assertCan(role, perm);
    throw new Error("forbidden_tool");
  }
  const perm = permForGrokTool(tool);
  if (perm) assertCan(role, perm);
}

export async function executeAgentTool(input: {
  tgId: number;
  call: AgentToolCall;
  chatId?: number;
  subscribed?: boolean;
  tier?: string | null;
}): Promise<AgentToolResult> {
  const role = await actorRole(input.tgId);
  try {
    assertAgentMayRun(role, input.call.name);
  } catch {
    return { ok: false, name: input.call.name, error: "ما عندك صلاحية لهذه الأداة." };
  }

  const ent = entitlementsFor(tierFromMember(input.tier, Boolean(input.subscribed)));
  try {
    if (input.call.name === "inspect_url") return await inspectUrl(input.call);
    if (input.call.name === "start_download") return await startDownload(input, ent.priority, ent.batchLinks);
    if (input.call.name === "job_status") return await jobStatus(input);
    if (input.call.name === "list_jobs") return await listJobs(input.tgId);
    if (input.call.name === "read_library") return await readLibrary(input.tgId, ent.library);
    if (input.call.name === "analyze_video") return await analyzeVideo(input.call, ent.analysis);
    return { ok: false, name: input.call.name, error: "الأداة غير متاحة." };
  } catch (err) {
    const message = err instanceof SsrfError ? "الرابط مرفوض." : "تعذر تنفيذ الأداة.";
    return { ok: false, name: input.call.name, error: message };
  }
}

async function inspectUrl(call: AgentToolCall): Promise<AgentToolResult> {
  const url = String(call.arguments.url ?? "");
  await assertSafeOutboundUrl(url);
  const platform = detectPlatform(url);
  return {
    ok: true,
    name: call.name,
    data: { platform, url, formats: platform === "generic" ? ["file"] : ["best"] },
  };
}

async function startDownload(
  input: { tgId: number; call: AgentToolCall; chatId?: number },
  priority: number,
  _batch: number,
): Promise<AgentToolResult> {
  const url = String(input.call.arguments.url ?? "");
  await assertSafeOutboundUrl(url);
  const { enqueueDownload } = await import("../jobs/queue.server");
  const queued = await enqueueDownload({
    tgId: input.tgId,
    chatId: input.chatId ?? input.tgId,
    url,
    priority,
  });
  if (!queued) return { ok: false, name: input.call.name, error: "ما انضاف الطلب." };
  if (queued.denied) return { ok: false, name: input.call.name, error: queued.denied === "cap" ? "خلصت الحصة." : "الطابور ممتلئ." };
  return {
    ok: true,
    name: input.call.name,
    jobId: queued.job.id,
    data: { status: queued.job.status, reused: queued.reused },
  };
}

async function jobStatus(input: { tgId: number; call: AgentToolCall }): Promise<AgentToolResult> {
  const { getJob } = await import("../jobs/queue.server");
  const job = await getJob(String(input.call.arguments.jobId ?? ""));
  if (!job || String(job.tg_id) !== String(input.tgId)) {
    return { ok: false, name: input.call.name, error: "ما لقيت المهمة." };
  }
  return { ok: true, name: input.call.name, jobId: job.id, data: { status: job.status, error: job.error } };
}

async function listJobs(tgId: number): Promise<AgentToolResult> {
  const { listUserJobs } = await import("../jobs/queue.server");
  const jobs = await listUserJobs(tgId, 8);
  return {
    ok: true,
    name: "list_jobs",
    data: { jobs: jobs.map((job) => ({ id: job.id, status: job.status })) },
  };
}

async function readLibrary(tgId: number, allowed: boolean): Promise<AgentToolResult> {
  if (!allowed) return { ok: false, name: "read_library", error: "السجل ضمن بلس وما فوق." };
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ url: string; title: string | null }>`
    select url, title from download_logs
    where tg_id = ${String(tgId)} and ok = true
    order by created_at desc
    limit 20
  `;
  return { ok: true, name: "read_library", data: { items: rows } };
}

async function analyzeVideo(call: AgentToolCall, allowed: boolean): Promise<AgentToolResult> {
  if (!allowed) return { ok: false, name: call.name, error: "التحليل ضمن برق ماكس." };
  const url = String(call.arguments.url ?? "");
  await assertSafeOutboundUrl(url);
  return {
    ok: false,
    name: call.name,
    error: "التحليل يحتاج ملفًا محمّلًا. ما ادّعيت أنه اكتمل.",
    data: { url, platform: detectPlatform(url) },
  };
}
