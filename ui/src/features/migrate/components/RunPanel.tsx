import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  Pause,
  Play,
  Square,
  TriangleAlert,
  XCircle,
  MinusCircle,
  Gauge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/common/ProgressBar';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/utils/cn';
import type { LogEntry, MigrationRun } from '../useMigrationRun';

const ICON = {
  start: <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />,
  phase: <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />,
  ok: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  skipped: <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />,
  warning: <TriangleAlert className="h-3.5 w-3.5 text-warning" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
} as const;

function LogRow({ entry }: { entry: LogEntry }) {
  return (
    <li
      className={cn(
        'flex items-start gap-2 px-3 py-1.5 text-13',
        entry.status === 'phase' && 'bg-muted/50 font-medium',
      )}
    >
      <span className="mt-0.5 shrink-0">{ICON[entry.status]}</span>
      <span className="min-w-0 flex-1">
        <span className="break-words">{entry.label}</span>
        {entry.message && (
          <span className="block break-words text-xs text-muted-foreground">{entry.message}</span>
        )}
      </span>
      <time className="shrink-0 font-mono text-2xs text-muted-foreground">
        {new Date(entry.at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </time>
    </li>
  );
}

/** Live progress, counts, pause / resume / cancel, and the activity log. */
export function RunPanel({ run }: { run: MigrationRun }) {
  const { state, counts, progress, log } = run;
  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : null;
  const active = state === 'running' || state === 'paused';

  return (
    <div className="space-y-4">
      <div className="space-y-2" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-13">
          <p className="font-medium">
            {state === 'paused' ? 'Paused · ' : ''}
            {progress.phase || 'Starting'}
          </p>
          <p className="tabular-nums text-muted-foreground">
            {progress.done} of {progress.total}
          </p>
        </div>
        <ProgressBar
          value={pct}
          label="Migration progress"
          tone={state === 'paused' ? 'warning' : 'primary'}
        />
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
          <span>
            <span className="font-semibold text-success">{counts.ok}</span> copied
          </span>
          <span>
            <span className="font-semibold text-warning">{counts.warning}</span> with warnings
          </span>
          <span>
            <span className="font-semibold text-foreground">{counts.skipped}</span> skipped
          </span>
          <span>
            <span className="font-semibold text-destructive">{counts.failed}</span> failed
          </span>
        </p>
      </div>

      {active && (
        <div className="flex flex-wrap items-center gap-2">
          {state === 'running' ? (
            <Button variant="outline" size="sm" onClick={run.pause}>
              <Pause />
              Pause
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={run.resume}>
              <Play />
              Resume
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={run.cancel} className="text-destructive">
            <Square />
            Stop
          </Button>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" />
            Parallel requests
            <Segmented
              label="Parallel requests"
              size="xs"
              value={String(run.concurrency) as '1' | '2' | '3' | '5'}
              onChange={(v) => run.setConcurrency(Number(v))}
              options={[
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '5', label: '5' },
              ]}
            />
          </div>
        </div>
      )}
      {active && (
        <p className="text-xs text-muted-foreground">
          Pausing finishes the items already in progress. Stopping keeps what's done; running again
          later picks up where it left off.
        </p>
      )}

      <ol
        className="max-h-80 divide-y divide-border-subtle overflow-y-auto rounded-lg border scrollbar-thin"
        aria-label="Activity"
      >
        {log.length === 0 ? (
          <li className="px-3 py-6 text-center text-13 text-muted-foreground">Waiting to start…</li>
        ) : (
          log.map((e) => <LogRow key={e.id} entry={e} />)
        )}
      </ol>
    </div>
  );
}
