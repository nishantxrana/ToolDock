import { useCallback, useRef, useState } from 'react';
import {
  Runner,
  type RunState,
  type RunTask,
  type TaskResult,
  type TaskStatus,
} from '@/lib/migration/runner';
import { rateGate } from '@/lib/api/migrate/http';
import {
  addReportItems,
  getItems,
  getReportItems,
  idMap,
  putItem,
  saveJob,
  updateJob,
  type Job,
  type JobItem,
} from '@/lib/migration/journal';
import { dedupeReport, type ReportItem } from '@/lib/migration/report';
import { useMigrationStore } from '@/store/migrationStore';

/** A task that records its result in the journal under (kind, sourceId). */
export interface MigTask extends Omit<RunTask, 'run'> {
  journal?: { kind: string; sourceId: string };
  run: (ctx: { signal: AbortSignal }) => Promise<(TaskResult & { targetId?: string }) | void>;
}

export interface LogEntry {
  id: number;
  at: number;
  label: string;
  status: TaskStatus | 'start' | 'phase';
  message?: string;
}

export interface Counts {
  ok: number;
  skipped: number;
  warning: number;
  failed: number;
}

export interface RunApi {
  /** Run one phase of tasks; finished items from an earlier run are skipped. */
  phase: (label: string, tasks: MigTask[], concurrency?: number) => Promise<void>;
  /** Add items to the migration report (deduplicated). */
  report: (items: ReportItem | ReportItem[]) => void;
  /** source → target ID map for a kind, from this job's journal. */
  idMap: (kind: string) => Promise<Map<string, string>>;
  log: (label: string, message?: string) => void;
  signal: AbortSignal;
  get cancelled(): boolean;
}

const MAX_LOG = 400;
const ZERO: Counts = { ok: 0, skipped: 0, warning: 0, failed: 0 };

export function useMigrationRun() {
  const runnerRef = useRef<Runner | null>(null);
  const jobRef = useRef<Job | null>(null);
  const seq = useRef(0);
  const [state, setState] = useState<RunState>('idle');
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [progress, setProgress] = useState({ done: 0, total: 0, phase: '' });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [report, setReport] = useState<ReportItem[]>([]);
  const [failures, setFailures] = useState<{ label: string; message: string }[]>([]);
  const [concurrency, setConcurrencyState] = useState(3);

  const pushLog = useCallback((entry: Omit<LogEntry, 'id' | 'at'>) => {
    setLog((l) => [{ ...entry, id: ++seq.current, at: Date.now() }, ...l].slice(0, MAX_LOG));
  }, []);

  /** Load a job's report and counts (e.g. to show a finished job's report). */
  const load = useCallback(async (job: Job) => {
    jobRef.current = job;
    setReport(dedupeReport(await getReportItems(job.id)));
    setCounts(job.counts ?? ZERO);
    const items = await getItems(job.id);
    setFailures(
      items
        .filter((i) => i.status === 'failed')
        .map((i) => ({ label: i.label ?? i.sourceId, message: i.message ?? '' })),
    );
    setState(job.status === 'done' ? 'done' : 'idle');
  }, []);

  const execute = useCallback(
    async (job: Job, work: (api: RunApi) => Promise<void>) => {
      const runner = new Runner(concurrency);
      runnerRef.current = runner;
      jobRef.current = job;
      rateGate.reset();
      setState('running');
      setCounts(ZERO);
      setFailures([]);
      setLog([]);
      setReport(dedupeReport(await getReportItems(job.id)));
      useMigrationStore.getState().setRunning(true);
      await saveJob({ ...job, status: 'running' });

      const total: Counts = { ...ZERO };
      const failed: { label: string; message: string }[] = [];
      const bump = (s: TaskStatus) => {
        total[s]++;
        setCounts({ ...total });
      };

      const api: RunApi = {
        signal: runner.signal,
        get cancelled() {
          return runner.cancelled;
        },
        log: (label, message) => pushLog({ label, status: 'phase', message }),
        idMap: (kind) => idMap(job.id, kind),
        report: (items) => {
          const list = Array.isArray(items) ? items : [items];
          if (list.length === 0) return;
          setReport((r) => dedupeReport([...r, ...list]));
          void addReportItems(job.id, list);
        },
        phase: async (label, tasks, phaseConcurrency) => {
          if (runner.cancelled) return;
          pushLog({ label, status: 'phase' });
          const done = new Map<string, JobItem>();
          for (const item of await getItems(job.id)) {
            if (item.status === 'ok' || item.status === 'warning')
              done.set(`${item.kind}|${item.sourceId}`, item);
          }
          const todo: RunTask[] = [];
          let finished = 0;
          setProgress({ done: 0, total: tasks.length, phase: label });
          for (const t of tasks) {
            if (t.journal && done.has(`${t.journal.kind}|${t.journal.sourceId}`)) {
              finished++;
              bump('skipped');
              continue;
            }
            todo.push({
              key: t.key,
              label: t.label,
              run: async (ctx) => {
                const result = (await t.run(ctx)) ?? { status: 'ok' as const };
                if (t.journal) {
                  await putItem({
                    jobId: job.id,
                    kind: t.journal.kind,
                    sourceId: t.journal.sourceId,
                    targetId: result.targetId,
                    label: t.label,
                    status: result.status,
                    message: result.message,
                  });
                }
                return result;
              },
            });
          }
          setProgress({ done: finished, total: tasks.length, phase: label });
          await runner.run(
            todo,
            {
              onStart: (t) => pushLog({ label: t.label, status: 'start' }),
              onDone: (t, r) => {
                finished++;
                bump(r.status);
                setProgress({ done: finished, total: tasks.length, phase: label });
                pushLog({ label: t.label, status: r.status, message: r.message });
                if (r.status === 'failed') {
                  failed.push({ label: t.label, message: r.message ?? 'Failed' });
                  setFailures([...failed]);
                  const original = tasks.find((x) => x.key === t.key);
                  if (original?.journal) {
                    void putItem({
                      jobId: job.id,
                      kind: original.journal.kind,
                      sourceId: original.journal.sourceId,
                      label: t.label,
                      status: 'failed',
                      message: r.message,
                    });
                  }
                }
              },
            },
            phaseConcurrency,
          );
        },
      };

      let status: Job['status'] = 'done';
      try {
        await work(api);
        if (runner.cancelled) status = 'cancelled';
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          status = 'failed';
          const message = e instanceof Error ? e.message : String(e);
          failed.push({ label: 'Migration stopped', message });
          setFailures([...failed]);
          pushLog({ label: 'Migration stopped', status: 'failed', message });
        } else status = 'cancelled';
      } finally {
        useMigrationStore.getState().setRunning(false);
        await updateJob(job.id, { status, counts: total });
        setState(status === 'cancelled' ? 'cancelled' : 'done');
      }
    },
    [concurrency, pushLog],
  );

  return {
    state,
    counts,
    progress,
    log,
    report,
    failures,
    concurrency,
    job: jobRef.current,
    setConcurrency: (n: number) => {
      setConcurrencyState(n);
      runnerRef.current?.setConcurrency(n);
    },
    pause: () => {
      runnerRef.current?.pause();
      setState('paused');
    },
    resume: () => {
      runnerRef.current?.resume();
      setState('running');
    },
    cancel: () => {
      runnerRef.current?.cancel();
      setState('cancelled');
    },
    execute,
    load,
  };
}

export type MigrationRun = ReturnType<typeof useMigrationRun>;
