export const BOT_LAYERS = {
  router: "classifyIntent",
  handlers: ["download", "upload", "ai", "live", "account", "subscription"],
  rule: "HTTP URLs never enter hostfile upload",
} as const;
