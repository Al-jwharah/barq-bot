export type BotState = {
  running: boolean;
  mode: "idle" | "polling" | "webhook";
  username: string;
  displayName: string;
  lastOkAt: number | null;
  processed: number;
  lastError: string | null;
  members: number;
};

const defaults: BotState = {
  running: false,
  mode: "idle",
  username: "barq_ibot",
  displayName: "برق ⚡️ لتحميل الفيديوهات",
  lastOkAt: null,
  processed: 0,
  lastError: null,
  members: 0,
};

const g = globalThis as unknown as { __barqBotState?: BotState };

function state(): BotState {
  if (!g.__barqBotState) g.__barqBotState = { ...defaults };
  return g.__barqBotState;
}

export function getBotState(): BotState {
  return { ...state() };
}

export function patchBotState(partial: Partial<BotState>) {
  Object.assign(state(), partial);
}

export function markProcessed() {
  const s = state();
  s.processed += 1;
  s.lastOkAt = Date.now();
  s.lastError = null;
}

export function markError(message: string) {
  state().lastError = message;
}

export function liveUsername(): string {
  return state().username || defaults.username;
}
