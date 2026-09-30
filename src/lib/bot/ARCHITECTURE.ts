export const BOT_LAYERS = {
  router: "classifyIntent",
  handlers: ["download", "upload", "ai", "live", "account", "subscription"],
  ai: ["route", "summarize", "captions", "smart-clips", "subtitles", "post-delivery"],
  rule: "HTTP URLs never enter hostfile upload",
} as const;
