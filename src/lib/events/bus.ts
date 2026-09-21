export type BarqEvent =
  | "download.completed"
  | "payment.success"
  | "user.created"
  | "live.started";

type Handler = (payload: Record<string, unknown>) => void | Promise<void>;

const listeners = new Map<string, Handler[]>();

export function on(event: BarqEvent, fn: Handler): void {
  const list = listeners.get(event) ?? [];
  list.push(fn);
  listeners.set(event, list);
}

export function emit(event: BarqEvent, payload: Record<string, unknown>): void {
  for (const fn of listeners.get(event) ?? []) {
    void Promise.resolve(fn(payload)).catch(() => undefined);
  }
}
