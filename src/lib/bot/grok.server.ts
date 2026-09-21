import type { ExtractResult } from "../media/types";
import {
  grokApiKey,
  AI_ENABLED,
  AI_TIMEOUT_MS,
  AI_MAX_OUTPUT_TOKENS,
  AI_MAX_MESSAGE_LENGTH,
  BARQ_AI_DAILY,
} from "./config.server";
import { parseGrokVerdict, type PornVerdict } from "./safety";
import type { GrokModel, GrokSpeed } from "./config.server";

const API = "https://api.x.ai/v1/chat/completions";

export function grokReady(): boolean {
  return Boolean(grokApiKey());
}

export const AI_USER_ERROR = "حدث خطأ مؤقت في Barq AI. حاول لاحقًا.";
export const AI_DAILY_LIMIT = BARQ_AI_DAILY;
export const AI_INPUT_MAX = AI_MAX_MESSAGE_LENGTH;
export const AI_TOKEN_MAX = AI_MAX_OUTPUT_TOKENS;
export const AI_TIMEOUT_LIMIT_MS = AI_TIMEOUT_MS;

const SECRET_RE =
  /xai-[A-Za-z0-9_-]+|\d{8,12}:AA[A-Za-z0-9_-]+|Bearer\s+\S+|sk-[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/\S+|sbp_[A-Za-z0-9_]+|vercel_blob_rw_[A-Za-z0-9_]+/gi;

export function redactSecrets(text: string): string {
  return String(text || "").replace(SECRET_RE, "[redacted]");
}

export function hideProviderError(_err?: unknown): string {
  return AI_USER_ERROR;
}

export function wantsMediaSummary(text: string): boolean {
  return /لخص|لخّص|لخّيص|ملخص|summarize|summary/i.test(text);
}

export function wantsWebSearch(text: string): boolean {
  return /ابحث|بحث|دور لي|find (me )?(a )?(video|clip)|search/i.test(text);
}

export function isAiFailureReply(text: string): boolean {
  return text === AI_USER_ERROR || text.includes("متوقف مؤقت") || text.includes("يتهيأ");
}

async function loadLastDownload(userId: number): Promise<{ url: string; title?: string; platform?: string } | undefined> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ url: string; title: string | null; platform: string | null }>`
      select url, title, platform from download_logs
      where tg_id = ${String(userId)} and ok = true
      order by created_at desc
      limit 1
    `;
    const row = rows[0];
    if (!row?.url) return undefined;
    return { url: row.url, title: row.title ?? undefined, platform: row.platform ?? undefined };
  } catch {
    return undefined;
  }
}

export function clipAiInput(text: string, max = AI_MAX_MESSAGE_LENGTH): string {
  const cap = Number.isFinite(max) && max > 0 ? max : AI_MAX_MESSAGE_LENGTH;
  return redactSecrets(String(text || "")).slice(0, cap);
}

export function aiEnabled() {
  return AI_ENABLED;
}

const inFlight = new Set<string>();

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ChatResult = {
  content: string;
  toolCalls: ToolCall[];
};

function scrubMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    content: redactSecrets(m.content),
    tool_calls: m.tool_calls?.map((c) => ({
      ...c,
      function: {
        ...c.function,
        arguments: redactSecrets(c.function.arguments || ""),
      },
    })),
  }));
}

async function chat(opts: {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  json?: boolean;
  tools?: unknown[];
  model?: string;
}): Promise<ChatResult> {
  const key = grokApiKey();
  if (!key) throw new Error(AI_USER_ERROR);
  const models = opts.model
    ? [opts.model, "grok-4", "grok-3"].filter((v, i, a) => a.indexOf(v) === i)
    : ["grok-4.5", "grok-4", "grok-3"];
  let lastErr: Error | null = null;
  const safeMessages = scrubMessages(opts.messages);
  for (const model of models) {
    const body: Record<string, unknown> = {
      model,
      messages: safeMessages,
      max_tokens: Math.min(opts.maxTokens || AI_MAX_OUTPUT_TOKENS, AI_MAX_OUTPUT_TOKENS),
      temperature: opts.temperature ?? 0.2,
    };
    if (opts.json) body.response_format = { type: "json_object" };
    if (opts.tools) {
      body.tools = opts.tools;
      body.tool_choice = "auto";
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        lastErr = new Error(AI_USER_ERROR);
        if (opts.tools) {
          try {
            const plain = { ...body };
            delete plain.tools;
            delete plain.tool_choice;
            const res2 = await fetch(API, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
              },
              body: JSON.stringify(plain),
              signal: controller.signal,
            });
            if (res2.ok) {
              const json2 = (await res2.json()) as {
                choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
              };
              const message2 = json2.choices?.[0]?.message;
              return {
                content: redactSecrets((message2?.content ?? "").trim()),
                toolCalls: message2?.tool_calls ?? [],
              };
            }
          } catch {
            /* next model */
          }
        }
        continue;
      }
      const json = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: ToolCall[];
          };
        }>;
      };
      const message = json.choices?.[0]?.message;
      return {
        content: redactSecrets((message?.content ?? "").trim()),
        toolCalls: message?.tool_calls ?? [],
      };
    } catch {
      lastErr = new Error(AI_USER_ERROR);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new Error(AI_USER_ERROR);
}

const CLASSIFY_SYSTEM = `You classify media for برق, a Telegram downloader.
ALLOW only: Islamic/religious clips, Quran, lectures, nasheed without pop music, beneficial stories, and clean comedy WITHOUT songs/music soundtrack.
BLOCK: songs, music videos, pop/rap/oud tarab, instrumental entertainment music, women-focused entertainment (dancing, mixing, beauty, fashion modeling, "harim"), pornography, NSFW, 18+, age-restricted adult.
If unsure between comedy-with-music vs clean comedy, block.
Reply JSON only:
{"block":boolean,"kind":"porn_film"|"nsfw"|"music"|"women"|"comedy"|"other","confidence":0-1,"evidence_ar":"جملة دليل قصيرة بالعربية بدون وصف جنسي تفصيلي"}`;

export async function classifyPornWithGrok(input: {
  url: string;
  result?: ExtractResult;
}): Promise<PornVerdict | null> {
  if (!aiEnabled() || !grokReady()) return null;
  const r = input.result;
  const user = clipAiInput(JSON.stringify({
    url: input.url,
    platform: r?.platform,
    title: r?.title?.slice(0, 240),
    author: [r?.author, r?.authorHandle].filter(Boolean).join(" ").slice(0, 120),
    caption: r?.text?.slice(0, 500),
    kinds: r?.items.map((i) => i.kind),
  }));
  try {
    const out = await chat({
      messages: [
        { role: "system", content: CLASSIFY_SYSTEM },
        { role: "user", content: user },
      ],
      maxTokens: 180,
      temperature: 0,
      json: true,
      model: "grok-4.5",
    });
    return parseGrokVerdict(out.content);
  } catch {
    return null;
  }
}

const FIND_MEDIA_SYSTEM = `You find a direct public media file URL for برق, a Telegram downloader.
Given a webpage URL and optional HTML snippet, return JSON only:
{"media_url":"https://...","kind":"video"|"photo"|"gif"|"audio"}
Rules:
- media_url must be a direct https file (mp4/webm/jpg/png/gif/m4a) or a public CDN progressive URL, not an HTML watch page.
- Never return porn-tube hosts, localhost, or private IPs.
- If you cannot find a real file URL, return {"media_url":"","kind":"video"}.`;

export function parseGrokMediaHint(raw: string): { url: string; kind: "video" | "photo" | "gif" | "audio" } | null {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as { media_url?: unknown; kind?: unknown };
    const url = typeof parsed.media_url === "string" ? parsed.media_url.trim() : "";
    if (!/^https:\/\//i.test(url)) return null;
    const kind =
      parsed.kind === "photo" || parsed.kind === "gif" || parsed.kind === "audio" || parsed.kind === "video"
        ? parsed.kind
        : "video";
    return { url, kind };
  } catch {
    return null;
  }
}

export async function grokFindDirectMedia(url: string): Promise<ExtractResult | null> {
  if (!aiEnabled() || !grokReady()) return null;
  let snippet = "";
  try {
    const { fetchText } = await import("../media/http");
    const page = await fetchText(url, undefined, 8000);
    snippet = page.text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").slice(0, 2500);
  } catch {
    snippet = "";
  }
  try {
    const out = await chat({
      messages: [
        { role: "system", content: FIND_MEDIA_SYSTEM },
        { role: "user", content: clipAiInput(`url: ${url}\nhtml:\n${snippet}`) },
      ],
      maxTokens: 220,
      temperature: 0,
      json: true,
      model: "grok-4.5",
    });
    const hint = parseGrokMediaHint(out.content);
    if (!hint) return null;
    const { assertSafeOutboundUrl } = await import("../media/ssrf");
    await assertSafeOutboundUrl(hint.url);
    const { matchPornDomain } = await import("./safety");
    if (matchPornDomain(hint.url)) return null;
    const contentType =
      hint.kind === "photo" ? "image/jpeg" : hint.kind === "gif" ? "image/gif" : hint.kind === "audio" ? "audio/mp4" : "video/mp4";
    return {
      platform: "generic",
      sourceUrl: url,
      items: [
        {
          kind: hint.kind,
          url: hint.url,
          variants: [{ url: hint.url, quality: "أصل", contentType }],
        },
      ],
    };
  } catch {
    return null;
  }
}

export async function diagnoseDownload(url: string, error: string): Promise<string | null> {
  if (!aiEnabled() || !grokReady()) return null;
  try {
    const out = await chat({
      messages: [
        {
          role: "system",
          content:
            "أنت مساعد تشغيل لبوت تحميل فيديو اسمه برق. اشرح سبب فشل التحميل بجملة أو جملتين بالعربي الفصيح المختصر، واقترح إصلاحًا عمليًا إن وُجد. لا تختلق أن المحتوى نزل. لا تذكر مفاتيح أو بنية تحتية.",
        },
        {
          role: "user",
          content: clipAiInput(`الرابط: ${url}\nالخطأ: ${redactSecrets(error)}`),
        },
      ],
      maxTokens: 180,
      temperature: 0.2,
      model: "grok-4.5",
    });
    return redactSecrets(out.content).slice(0, 700) || null;
  } catch {
    return null;
  }
}

const OWNER_SYSTEM = `أنت Barq AI داخل بوت برق، تتحدث مع المالك فقط بصلاحيات كاملة.
- إذا طلب تنفيذ شيء إداري نفّذه فورًا عبر الأدوات ثم أكّد النتيجة بجملة قصيرة.
- قناة @barq_all للتحديثات والأخبار والمسابقات. القناة والمجاني والإعلان جاهزة لكن مطفأة حتى يطلب تشغيلها.
- لا تسأل تأكيدًا إلا إذا كان الأمر إرسالًا جماعيًا أو إيقاف البوت.
- أجب بالعربية ما لم يكتب بغيرها. كن مباشرًا.
- لا تكشف مفاتيح API أو توكن البوت.
- للمستخدمين العاديين اسمك Barq AI وليس جروك.`;

const OWNER_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_stats",
      description: "أرقام البوت: أعضاء، مشتركين، تحميلات، نجوم، محظور",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_downloads",
      description: "آخر التحميلات مع الحالة",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 3, maximum: 30 } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_blocked",
      description: "محاولات التحميل الإباحي المحجوبة",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 3, maximum: 30 } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_code",
      description: "إنشاء كود تفعيل",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string" },
          days: { type: "integer" },
          uses: { type: "integer" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deactivate_code",
      description: "إلغاء كود اشتراك",
      parameters: {
        type: "object",
        properties: { code: { type: "string" } },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grant_days",
      description: "منح اشتراك لمستخدم بتليجرام آيدي",
      parameters: {
        type: "object",
        properties: {
          tg_id: { type: "string" },
          days: { type: "integer" },
        },
        required: ["tg_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ban_user",
      description: "حظر مستخدم من البوت",
      parameters: {
        type: "object",
        properties: { tg_id: { type: "string" } },
        required: ["tg_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unban_user",
      description: "فك حظر مستخدم",
      parameters: {
        type: "object",
        properties: { tg_id: { type: "string" } },
        required: ["tg_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_subscription",
      description: "تعيين مدة الاشتراك من الآن (0 يلغي)",
      parameters: {
        type: "object",
        properties: {
          tg_id: { type: "string" },
          days: { type: "integer" },
        },
        required: ["tg_id", "days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "broadcast",
      description: "إرسال رسالة لكل من بدأ البوت",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_bot_paused",
      description: "إيقاف أو تشغيل البوت للمستخدمين",
      parameters: {
        type: "object",
        properties: { paused: { type: "boolean" } },
        required: ["paused"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_channel",
      description: "تعيين قناة الانضمام للمجاني، فارغ للمسح",
      parameters: {
        type: "object",
        properties: { username: { type: "string" } },
        required: ["username"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_setting",
      description: "تغيير إعداد: ads_enabled, grok_owner, grok_web_search, grok_tools, restrictions_on, grok_model, grok_speed, free_downloads, ads_text, bot_paused, required_channel",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: { type: "string" },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_codes",
      description: "قائمة أكواد التفعيل",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_members",
      description: "آخر الأعضاء مع الاشتراك والتحميلات",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 3, maximum: 40 } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_member",
      description: "بيانات عضو بمعرّف تليجرام",
      parameters: {
        type: "object",
        properties: { tg_id: { type: "string" } },
        required: ["tg_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_settings",
      description: "إعدادات البوت الحالية",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "send_to_user",
      description: "إرسال رسالة لمستخدم واحد بمعرّف تليجرام",
      parameters: {
        type: "object",
        properties: {
          tg_id: { type: "string" },
          text: { type: "string" },
        },
        required: ["tg_id", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "post_news",
      description: "نشر تحديث في قناة برق @barq_all",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          pin: { type: "boolean" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "post_update",
      description: "نشر خبر في قناة برق",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          pin: { type: "boolean" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_contest",
      description: "بدء مسابقة في القناة مع زر أشارك. grant_days يمنح الفائز اشتراكًا تلقائيًا",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          prize: { type: "string" },
          rules: { type: "string" },
          winners_count: { type: "integer" },
          grant_days: { type: "integer" },
        },
        required: ["title", "prize"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draw_contest",
      description: "سحب فائزي المسابقة المفتوحة وإعلانهم في القناة",
      parameters: {
        type: "object",
        properties: { contest_id: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_contests",
      description: "قائمة المسابقات وعدد المشاركين",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "copy_last_media_to_channel",
      description: "نشر آخر صورة/فيديو أرسله المالك إلى قناة برق",
      parameters: {
        type: "object",
        properties: { caption: { type: "string" } },
      },
    },
  },
];

const ALLOWED_GROK_SETTINGS = new Set([
  "ads_enabled",
  "grok_owner",
  "grok_web_search",
  "grok_tools",
  "restrictions_on",
  "grok_model",
  "grok_speed",
  "free_downloads",
  "ads_text",
  "bot_paused",
  "required_channel",
]);

async function runOwnerTool(name: string, rawArgs: string, fromId?: number | string): Promise<string> {
  const { permForGrokTool, requireActor } = await import("./acl.server");
  const perm = permForGrokTool(name);
  if (perm && fromId != null) {
    try {
      await requireActor(fromId, perm);
    } catch {
      return JSON.stringify({ error: "لا صلاحية" });
    }
  } else if (perm && fromId == null) {
    return JSON.stringify({ error: "لا صلاحية" });
  }
  const store = await import("./store.server");
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    args = {};
  }
  if (name === "get_stats") {
    const s = await store.adminStats();
    return JSON.stringify(s);
  }
  if (name === "list_recent_downloads") {
    const limit = Number(args.limit ?? 12);
    const rows = await store.listLogs(Math.min(30, Math.max(3, limit)));
    return JSON.stringify(rows.slice(0, 15));
  }
  if (name === "list_blocked") {
    const limit = Number(args.limit ?? 10);
    const rows = await store.listFilterEvents(Math.min(30, Math.max(3, limit)));
    return JSON.stringify(rows);
  }
  if (name === "create_code") {
    const code = String(args.code ?? "").trim();
    const days = Number(args.days ?? 30);
    const uses = Number(args.uses ?? 20);
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(code)) return JSON.stringify({ error: "كود غير صالح" });
    const saved = await store.createCode(code, days, uses);
    return JSON.stringify({ code: saved, days, uses });
  }
  if (name === "deactivate_code") {
    const code = String(args.code ?? "").trim();
    if (!code) return JSON.stringify({ error: "كود مفقود" });
    await store.setCodeActive(code, false);
    return JSON.stringify({ code, active: false });
  }
  if (name === "grant_days") {
    const tgId = String(args.tg_id ?? "").trim();
    const days = Number(args.days ?? 30);
    if (!/^\d{3,20}$/.test(tgId)) return JSON.stringify({ error: "معرّف غير صالح" });
    await store.grantDays(tgId, days);
    return JSON.stringify({ ok: true, tgId, days });
  }
  if (name === "ban_user") {
    const tgId = String(args.tg_id ?? "").trim();
    if (!/^\d{3,20}$/.test(tgId)) return JSON.stringify({ error: "معرّف غير صالح" });
    const { isOwnerId } = await import("./config.server");
    if (isOwnerId(tgId)) return JSON.stringify({ error: "لا يمكن حظر المالك" });
    await store.banUser(tgId);
    const { logAudit } = await import("./observability.server");
    await logAudit({ action: "ban", target: tgId, detail: "grok" });
    return JSON.stringify({ ok: true, banned: tgId });
  }
  if (name === "unban_user") {
    const tgId = String(args.tg_id ?? "").trim();
    if (!/^\d{3,20}$/.test(tgId)) return JSON.stringify({ error: "معرّف غير صالح" });
    await store.unbanUser(tgId);
    const { logAudit } = await import("./observability.server");
    await logAudit({ action: "unban", target: tgId, detail: "grok" });
    return JSON.stringify({ ok: true, unbanned: tgId });
  }
  if (name === "set_subscription") {
    const tgId = String(args.tg_id ?? "").trim();
    const days = Number(args.days ?? 0);
    if (!/^\d{3,20}$/.test(tgId)) return JSON.stringify({ error: "معرّف غير صالح" });
    await store.setSubscriptionDays(tgId, days);
    return JSON.stringify({ ok: true, tgId, days });
  }
  if (name === "broadcast") {
    const text = String(args.text ?? "").trim();
    if (text.length < 1 || text.length > 3500) return JSON.stringify({ error: "النص غير صالح" });
    const { telegram } = await import("./telegram.server");
    const ids = await store.memberIds();
    let sent = 0;
    for (const id of ids) {
      try {
        await telegram.sendMessage(Number(id), text);
        sent += 1;
      } catch {
        /* skip */
      }
    }
    return JSON.stringify({ sent, total: ids.length });
  }
  if (name === "set_bot_paused") {
    const paused = Boolean(args.paused);
    await store.setSetting("bot_paused", paused ? "on" : "off");
    return JSON.stringify({ paused });
  }
  if (name === "set_channel") {
    const { normalizeChannel } = await import("./brand");
    const username = normalizeChannel(String(args.username ?? ""));
    await store.setSetting("required_channel", username);
    return JSON.stringify({ channel: username || null });
  }
  if (name === "set_setting") {
    const key = String(args.key ?? "").trim();
    let value = String(args.value ?? "").trim();
    if (!ALLOWED_GROK_SETTINGS.has(key)) return JSON.stringify({ error: "إعداد غير مسموح" });
    if (key === "porn_filter") return JSON.stringify({ ok: true, note: "حجب +18 دائم ولا يُوقف" });
    if (key === "required_channel") {
      const { normalizeChannel } = await import("./brand");
      value = normalizeChannel(value);
    }
    await store.setSetting(key, value);
    return JSON.stringify({ key, value });
  }
  if (name === "list_codes") {
    const rows = await store.listCodes();
    return JSON.stringify(rows.slice(0, 30));
  }
  if (name === "list_members") {
    const limit = Number(args.limit ?? 15);
    const rows = await store.listMembers(Math.min(40, Math.max(3, limit)));
    return JSON.stringify(
      rows.map((m) => ({
        tg_id: m.tg_id,
        username: m.username,
        first_name: m.first_name,
        downloads_used: m.downloads_used,
        subscribed_until: m.subscribed_until,
      })),
    );
  }
  if (name === "get_member") {
    const tgId = String(args.tg_id ?? "").trim();
    if (!/^\d{3,20}$/.test(tgId)) return JSON.stringify({ error: "معرّف غير صالح" });
    const row = await store.getMember(tgId);
    return JSON.stringify(row ?? { error: "غير موجود" });
  }
  if (name === "get_settings") {
    const { botSettings } = await import("./settings.server");
    const s = await botSettings();
    return JSON.stringify({
      paused: s.paused,
      adsEnabled: s.adsEnabled,
      adsText: s.adsText,
      grokOwner: s.grokOwner,
      grokModel: s.grokModel,
      grokSpeed: s.grokSpeed,
      grokWebSearch: s.grokWebSearch,
      grokTools: s.grokTools,
      restrictionsOn: s.restrictionsOn,
      requiredChannel: s.requiredChannel,
      freeDownloads: s.freeDownloads,
    });
  }
  if (name === "send_to_user") {
    const tgId = String(args.tg_id ?? "").trim();
    const text = String(args.text ?? "").trim();
    if (!/^\d{3,20}$/.test(tgId)) return JSON.stringify({ error: "معرّف غير صالح" });
    if (text.length < 1 || text.length > 3500) return JSON.stringify({ error: "النص غير صالح" });
    const { telegram } = await import("./telegram.server");
    await telegram.sendMessage(Number(tgId), text);
    return JSON.stringify({ ok: true, tgId });
  }
  if (name === "post_news" || name === "post_update") {
    const text = String(args.text ?? "").trim();
    if (text.length < 2) return JSON.stringify({ error: "النص قصير" });
    const channel = await import("./channel.server");
    const posted =
      name === "post_news"
        ? await channel.postNews(text, Boolean(args.pin))
        : await channel.postUpdate(text, Boolean(args.pin));
    return JSON.stringify({ ok: true, messageId: posted?.messageId ?? null });
  }
  if (name === "start_contest") {
    const channel = await import("./channel.server");
    const contest = await channel.startContest({
      title: String(args.title ?? ""),
      prize: String(args.prize ?? ""),
      rules: String(args.rules ?? ""),
      winnersCount: Number(args.winners_count ?? 1),
      grantDays: Number(args.grant_days ?? 0),
    });
    return JSON.stringify({ ok: true, id: contest.id, messageId: contest.messageId });
  }
  if (name === "draw_contest") {
    const channel = await import("./channel.server");
    const id = String(args.contest_id ?? "").trim() || undefined;
    const result = await channel.drawContest(id);
    return JSON.stringify(result);
  }
  if (name === "list_contests") {
    const channel = await import("./channel.server");
    const rows = await channel.contestSummary();
    return JSON.stringify(rows);
  }
  if (name === "copy_last_media_to_channel") {
    const channel = await import("./channel.server");
    const result = await channel.copyOwnerMediaToChannel(String(args.caption ?? ""));
    return JSON.stringify(result);
  }
  return JSON.stringify({ error: "unknown tool" });
}

const g = globalThis as unknown as { __barqOwnerChat?: ChatMessage[] };

function ownerHistory(): ChatMessage[] {
  if (!g.__barqOwnerChat) g.__barqOwnerChat = [];
  return g.__barqOwnerChat;
}

function speedParams(speed: GrokSpeed): { maxTokens: number; temperature: number } {
  if (speed === "fast") return { maxTokens: Math.min(400, AI_MAX_OUTPUT_TOKENS), temperature: 0.25 };
  if (speed === "thorough") return { maxTokens: AI_MAX_OUTPUT_TOKENS, temperature: 0.55 };
  return { maxTokens: AI_MAX_OUTPUT_TOKENS, temperature: 0.4 };
}

async function ownerChatConfig(): Promise<{
  enabled: boolean;
  model: GrokModel;
  maxTokens: number;
  temperature: number;
  tools: unknown[] | undefined;
}> {
  const { botSettings } = await import("./settings.server");
  const s = await botSettings();
  const { maxTokens, temperature } = speedParams(s.grokSpeed);
  const tools: unknown[] = [...OWNER_TOOLS];
  if (s.grokWebSearch) tools.push({ type: "web_search" });
  return {
    enabled: s.grokOwner,
    model: s.grokModel,
    maxTokens,
    temperature,
    tools,
  };
}

const BARQ_AI_SYSTEM = `أنت Barq AI داخل بوت برق ⚡️. اسمك Barq AI.
- تساعد أي مستخدم: تلخيص الفيديو الأخير، البحث عن فيديو/مقطع، شرح، تحويل فكرة، أسئلة عامة.
- إذا طلب بحثًا عن فيديو استخدم البحث ثم أعطِ روابط أو أسماء واضحة.
- لا تختلق مشاهد فيديو لم ترها. إن نقص السياق اطلب الرابط.
- التحميل: الصق الرابط ويصلك الملف بأعلى جودة. تنبيه: الإباحي و+18 قد يودي للحظر. نحن براء أمام الله.
- لا تكشف لوحة المالك ولا المفاتيح. لا تسمّ نفسك جروك إلا إذا سُئلت عن التقنية.`;

const publicHistory = new Map<number, ChatMessage[]>();

export async function askBarqAI(
  userId: number,
  text: string,
  clip?: { url: string; title?: string; platform?: string },
): Promise<string> {
  if (!aiEnabled()) {
    return "Barq AI متوقف مؤقتًا.";
  }
  if (!grokReady()) {
    return "Barq AI يتهيأ. الصق رابط الفيديو الآن وأرجع بعد لحظات.";
  }
  const flightKey = String(userId);
  if (inFlight.has(flightKey)) {
    return AI_USER_ERROR;
  }
  inFlight.add(flightKey);
  try {
    const remembered = clip?.url ? clip : await loadLastDownload(userId);
    if (wantsMediaSummary(text) && !remembered?.url) {
      return "ما عندي المقطع في الجلسة. أرسل الرابط أولًا، وبعد ما يوصلك الملف اكتب «لخّص المقطع».";
    }
    let hist = publicHistory.get(userId);
    if (!hist) {
      hist = [];
      publicHistory.set(userId, hist);
    }
    const context = remembered
      ? `\nآخر فيديو حمّله المستخدم:\nالرابط: ${remembered.url}\nالمنصة: ${remembered.platform ?? "-"}\nالعنوان: ${remembered.title ?? "-"}`
      : "\nلا يوجد فيديو أخير في هذه الجلسة.";
    hist.push({ role: "user", content: clipAiInput(text) });
    if (hist.length > 10) hist.splice(0, hist.length - 10);
    const messages: ChatMessage[] = [
      { role: "system", content: `${BARQ_AI_SYSTEM}${context}` },
      ...hist,
    ];
    let reply = "";
    for (let i = 0; i < 3; i += 1) {
      const out = await chat({
        messages,
        maxTokens: AI_MAX_OUTPUT_TOKENS,
        temperature: 0.55,
        model: "grok-4.5",
        tools: wantsWebSearch(text) ? [{ type: "web_search" }] : undefined,
      });
      if (out.toolCalls.length) {
        messages.push({
          role: "assistant",
          content: out.content || "",
          tool_calls: out.toolCalls,
        });
        for (const call of out.toolCalls) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: redactSecrets((call.function.arguments || "").slice(0, 4000) || "ok"),
          });
        }
        continue;
      }
      reply = out.content;
      break;
    }
    if (!reply) reply = "تمام. أرسل الرابط أو اكتب سؤالك.";
    reply = redactSecrets(reply).slice(0, 3500);
    hist.push({ role: "assistant", content: reply });
    const { logAiUsage } = await import("./store.server");
    await logAiUsage({ tgId: userId, model: "grok-4.5" }).catch(() => undefined);
    return reply;
  } catch (err) {
    return hideProviderError(err);
  } finally {
    inFlight.delete(flightKey);
  }
}

export async function askOwnerGrok(text: string, fromId: number | string): Promise<string> {
  if (!aiEnabled()) {
    return "Barq AI متوقف مؤقتًا.";
  }
  if (!grokReady()) {
    return "Barq AI غير متاح الآن. أوامر الإدارة ما زالت تعمل من لوحة التحكم.";
  }
  const flightKey = String(fromId);
  if (inFlight.has(flightKey)) {
    return AI_USER_ERROR;
  }
  inFlight.add(flightKey);
  try {
    const cfg = await ownerChatConfig();
    const history = ownerHistory();
    history.push({ role: "user", content: clipAiInput(text) });
    if (history.length > 16) history.splice(0, history.length - 16);

    const messages: ChatMessage[] = [{ role: "system", content: OWNER_SYSTEM }, ...history];
    let reply = "";
    for (let i = 0; i < 3; i += 1) {
      const out = await chat({
        messages,
        maxTokens: AI_MAX_OUTPUT_TOKENS,
        temperature: cfg.temperature,
        tools: cfg.tools,
        model: cfg.model,
      });
      if (out.toolCalls.length) {
        messages.push({
          role: "assistant",
          content: out.content || "",
          tool_calls: out.toolCalls,
        });
        for (const call of out.toolCalls) {
          const result = await runOwnerTool(call.function.name, call.function.arguments, fromId);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: redactSecrets(result).slice(0, 4000),
          });
        }
        continue;
      }
      reply = out.content;
      break;
    }
    if (!reply) reply = "تم.";
    reply = redactSecrets(reply).slice(0, 3500);
    history.push({ role: "assistant", content: reply.slice(0, 4000) });
    return reply;
  } catch (err) {
    return hideProviderError(err);
  } finally {
    inFlight.delete(flightKey);
  }
}
