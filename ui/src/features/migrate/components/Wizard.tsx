import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, MonitorSmartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils/cn';
import {
  groupBySeverity,
  SEVERITY_LABEL,
  type ReportItem,
  type ReportSeverity,
} from '@/lib/migration/report';

export interface WizardStep {
  id: string;
  label: string;
}

/** Numbered step strip. Finished steps can be clicked to go back. */
export function Stepper({
  steps,
  current,
  onGo,
  locked,
}: {
  steps: WizardStep[];
  current: number;
  onGo: (index: number) => void;
  /** While running, steps can't be revisited. */
  locked?: boolean;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Migration steps">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.id} className="flex items-center gap-1">
            <button
              type="button"
              disabled={!done || locked}
              onClick={() => onGo(i)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1 text-13 transition-colors',
                active && 'font-semibold text-foreground',
                done && !locked && 'text-foreground hover:bg-foreground/[0.05]',
                !done && !active && 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border text-2xs font-semibold tabular-nums',
                  active && 'border-primary bg-primary text-primary-foreground',
                  done && 'border-success-border bg-success-subtle text-success',
                  !done && !active && 'border-border-strong',
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              {s.label}
            </button>
            {i < steps.length - 1 && <span className="h-px w-4 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/** Back / Next row at the bottom of a step. */
export function StepNav({
  onBack,
  onNext,
  nextLabel = 'Next',
  nextDisabled,
  hint,
  next,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  /** Why Next is disabled, or what happens next. */
  hint?: ReactNode;
  /** Replace the Next button entirely. */
  next?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
      <div>
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft />
            Back
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        {next ??
          (onNext && (
            <Button size="sm" onClick={onNext} disabled={nextDisabled}>
              {nextLabel}
              <ChevronRight />
            </Button>
          ))}
      </div>
    </div>
  );
}

/** Migration screens are detailed work; below 1024px show a notice instead. */
export function DesktopOnly({ children }: { children: ReactNode }) {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(
    () => typeof window === 'undefined' || window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  if (wide) return <>{children}</>;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
      <MonitorSmartphone className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      <h1 className="font-display text-lg font-semibold">Use a wider screen</h1>
      <p className="text-sm text-muted-foreground">
        Migrations involve detailed mapping tables, so they need a screen at least 1024 pixels wide.
        Open ToolDock on a laptop or desktop to continue. The Tools mode works on any screen.
      </p>
    </div>
  );
}

const SEVERITY_STYLE: Record<ReportSeverity, string> = {
  action: 'border-warning-border bg-warning-subtle text-warning',
  warning: 'border-info-border bg-info-subtle text-info',
  info: 'border-border bg-muted text-muted-foreground',
};

export function SeverityBadge({ severity }: { severity: ReportSeverity }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-sm border px-1.5 text-2xs font-semibold',
        SEVERITY_STYLE[severity],
      )}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

/** Report items as a grouped list (used by Review and the final report). */
export function ReportList({
  items,
  checklist,
  max = 200,
}: {
  items: ReportItem[];
  checklist?: boolean;
  max?: number;
}) {
  const g = groupBySeverity(items);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  return (
    <div className="space-y-4">
      {(['action', 'warning', 'info'] as const).map((sev) =>
        g[sev].length === 0 ? null : (
          <section key={sev} className="space-y-2">
            <h3 className="flex items-center gap-2 text-13 font-semibold">
              <SeverityBadge severity={sev} />
              <span className="tabular-nums text-muted-foreground">{g[sev].length}</span>
            </h3>
            <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border">
              {g[sev].slice(0, max).map((item, i) => {
                const id = sev === 'action' ? i : -1;
                return (
                  <li
                    key={`${sev}-${i}`}
                    className="flex items-start gap-3 bg-card px-3 py-2.5 text-13"
                  >
                    {checklist && sev === 'action' && (
                      <Checkbox
                        className="mt-0.5"
                        checked={checked.has(id)}
                        onCheckedChange={(v) =>
                          setChecked((c) => {
                            const n = new Set(c);
                            if (v) n.add(id);
                            else n.delete(id);
                            return n;
                          })
                        }
                        aria-label={`Mark "${item.title}" done`}
                      />
                    )}
                    <div
                      className={cn(
                        'min-w-0 flex-1',
                        checked.has(id) && 'text-muted-foreground line-through',
                      )}
                    >
                      <p className="font-medium">
                        {item.title}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {item.area}
                        </span>
                      </p>
                      <p className="mt-0.5 break-words text-muted-foreground">{item.detail}</p>
                    </div>
                    {item.targetUrl && (
                      <a
                        href={item.targetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium underline decoration-border-strong underline-offset-2 hover:decoration-foreground"
                      >
                        Open
                      </a>
                    )}
                  </li>
                );
              })}
              {g[sev].length > max && (
                <li className="bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {g[sev].length - max} more in the downloaded report.
                </li>
              )}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

/** Review step: what will happen, what won't be copied, and an acknowledgement. */
export function ReviewPanel({
  summary,
  predicted,
  acknowledged,
  onAcknowledge,
}: {
  summary: ReactNode;
  predicted: ReportItem[];
  acknowledged: boolean;
  onAcknowledge: (v: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm">{summary}</div>
      {predicted.length > 0 ? (
        <>
          <p className="text-13 text-muted-foreground">
            These are known before the run starts. Anything else that comes up is added to the final
            report.
          </p>
          <ReportList items={predicted} max={50} />
        </>
      ) : (
        <p className="text-13 text-muted-foreground">Nothing to flag ahead of the run.</p>
      )}
      <label className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-subtle px-4 py-3 text-13">
        <Checkbox
          checked={acknowledged}
          onCheckedChange={(v) => onAcknowledge(v === true)}
          className="mt-0.5"
          aria-labelledby="review-ack"
        />
        <span id="review-ack">
          I understand what won't be copied, and that this writes to the <strong>target</strong>{' '}
          project. Nothing in the source is changed.
        </span>
      </label>
    </div>
  );
}
