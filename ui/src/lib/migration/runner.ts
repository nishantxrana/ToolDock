/**
 * Migration task queue: limited concurrency, pause / resume / cancel, and one
 * result per task. A failing task never stops the run; throttling and retries
 * happen a layer down, in lib/api/migrate/http.ts.
 */

export type TaskStatus = 'ok' | 'skipped' | 'warning' | 'failed';

export interface TaskResult {
  status: TaskStatus;
  message?: string;
}

export interface RunTask {
  /** Stable id, e.g. "repo:3f2a…". Used by the journal to skip finished work. */
  key: string;
  label: string;
  run: (ctx: { signal: AbortSignal }) => Promise<TaskResult | void>;
}

export interface RunEvents {
  onStart?: (task: RunTask) => void;
  onDone?: (task: RunTask, result: TaskResult) => void;
}

export type RunState = 'idle' | 'running' | 'paused' | 'cancelled' | 'done';

export interface RunSummary {
  ok: number;
  skipped: number;
  warning: number;
  failed: number;
  cancelled: boolean;
}

function isAbort(e: unknown) {
  return e instanceof DOMException && e.name === 'AbortError';
}

export class Runner {
  private controller = new AbortController();
  private paused = false;
  private resumeWaiters: (() => void)[] = [];
  state: RunState = 'idle';

  constructor(private concurrency = 3) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get cancelled(): boolean {
    return this.controller.signal.aborted;
  }

  setConcurrency(n: number) {
    this.concurrency = Math.min(5, Math.max(1, Math.round(n)));
  }

  pause() {
    if (this.state === 'running') {
      this.paused = true;
      this.state = 'paused';
    }
  }

  resume() {
    if (this.state !== 'paused') return;
    this.paused = false;
    this.state = 'running';
    for (const wake of this.resumeWaiters.splice(0)) wake();
  }

  cancel() {
    this.controller.abort();
    this.state = 'cancelled';
    for (const wake of this.resumeWaiters.splice(0)) wake();
  }

  private waitWhilePaused(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise((resolve) => this.resumeWaiters.push(resolve));
  }

  /**
   * Run one batch of tasks. Call it again for the next phase (e.g. links after
   * creates); pause and cancel carry across phases.
   */
  async run(
    tasks: RunTask[],
    events: RunEvents = {},
    concurrency = this.concurrency,
  ): Promise<RunSummary> {
    const summary: RunSummary = { ok: 0, skipped: 0, warning: 0, failed: 0, cancelled: false };
    if (this.state === 'idle' || this.state === 'done') this.state = 'running';
    let next = 0;

    const worker = async () => {
      for (;;) {
        await this.waitWhilePaused();
        if (this.cancelled) return;
        const task = tasks[next++];
        if (!task) return;
        events.onStart?.(task);
        let result: TaskResult;
        try {
          result = (await task.run({ signal: this.signal })) ?? { status: 'ok' };
        } catch (e) {
          if (isAbort(e) || this.cancelled) return;
          result = { status: 'failed', message: e instanceof Error ? e.message : String(e) };
        }
        summary[result.status]++;
        events.onDone?.(task, result);
      }
    };

    const width = Math.max(1, Math.min(concurrency, tasks.length));
    await Promise.all(Array.from({ length: width }, worker));
    summary.cancelled = this.cancelled;
    if (!this.cancelled && this.state === 'running') this.state = 'done';
    return summary;
  }
}
