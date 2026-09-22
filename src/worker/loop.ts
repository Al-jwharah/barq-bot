import { workerDryRunEnabled, workerIdleMs } from "./flags";

export type DrainFn = (max?: number) => Promise<Array<{ id?: string; status: string; error?: string }>>;
export type ClaimDryFn = () => Promise<{ id?: string; status: string }>;

export type WorkerLoopStats = {
  startedAt: string;
  drains: number;
  claimed: number;
  emptyPolls: number;
  errors: number;
  lastDrainAt: string | null;
  lastError: string | null;
  running: boolean;
  shuttingDown: boolean;
};

export type WorkerLoopOptions = {
  drain: DrainFn;
  /** When BARQ_WORKER_DRY_RUN=on, claim+complete without Telegram/extract. */
  dryClaim?: ClaimDryFn;
  idleMs?: () => number;
  /** Called after each drain wave (for tests). */
  onWave?: (results: Array<{ id?: string; status: string }>) => void;
  /** Inject sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Always-on drain loop with controlled concurrency (via drainJobs cap)
 * and idle backoff when the queue is empty.
 */
export class WorkerLoop {
  private stopped = false;
  private shuttingDown = false;
  private active: Promise<unknown> | null = null;
  private wakeWaiters: Array<() => void> = [];
  readonly stats: WorkerLoopStats = {
    startedAt: new Date().toISOString(),
    drains: 0,
    claimed: 0,
    emptyPolls: 0,
    errors: 0,
    lastDrainAt: null,
    lastError: null,
    running: false,
    shuttingDown: false,
  };

  constructor(private readonly opts: WorkerLoopOptions) {}

  /** Nudge the loop out of idle sleep (from /wake). */
  nudge(): void {
    const waiters = this.wakeWaiters.splice(0);
    for (const w of waiters) w();
  }

  async stop(graceMs = 25_000): Promise<void> {
    this.shuttingDown = true;
    this.stats.shuttingDown = true;
    this.nudge();
    const deadline = Date.now() + graceMs;
    while (this.active && Date.now() < deadline) {
      await (this.opts.sleep ?? defaultSleep)(100);
    }
    this.stopped = true;
    this.stats.running = false;
  }

  async run(): Promise<void> {
    this.stats.running = true;
    const sleep = this.opts.sleep ?? defaultSleep;
    const idleMs = this.opts.idleMs ?? workerIdleMs;

    while (!this.stopped && !this.shuttingDown) {
      try {
        const dry = workerDryRunEnabled() && this.opts.dryClaim;
        const wave = dry
          ? Promise.all([this.opts.dryClaim!(), this.opts.dryClaim!(), this.opts.dryClaim!()])
          : this.opts.drain();
        this.active = wave;
        const results = await wave;
        this.active = null;
        this.stats.drains += 1;
        this.stats.lastDrainAt = new Date().toISOString();
        this.opts.onWave?.(results);

        let nonempty = 0;
        for (const r of results) {
          if (r.status === "empty") continue;
          if (r.status === "error") {
            this.stats.errors += 1;
            this.stats.lastError = r.error ?? "error";
            continue;
          }
          nonempty += 1;
          this.stats.claimed += 1;
        }

        if (nonempty === 0) {
          this.stats.emptyPolls += 1;
          await this.idleSleep(sleep, idleMs());
        }
      } catch (err) {
        this.active = null;
        this.stats.errors += 1;
        this.stats.lastError = err instanceof Error ? err.message.slice(0, 120) : "loop";
        await this.idleSleep(sleep, Math.min(5_000, idleMs() * 2));
      }
    }
    this.stats.running = false;
  }

  private idleSleep(sleep: (ms: number) => Promise<void>, ms: number): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      this.wakeWaiters.push(finish);
      // Always schedule a macrotask so a no-op sleep cannot starve timers / stop().
      void Promise.resolve(sleep(ms)).finally(() => {
        setTimeout(finish, 0);
      });
    });
  }
}
