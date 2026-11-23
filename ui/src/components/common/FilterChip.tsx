import { cn } from '@/lib/utils/cn';

import { TONE_MARK, type Tone } from '@/lib/utils/tone';

const TONE_ACTIVE: Record<Tone, string> = {
  success: 'border-success-border bg-success-subtle text-success',
  warning: 'border-warning-border bg-warning-subtle text-warning',
  destructive: 'border-destructive-border bg-destructive-subtle text-destructive',
  info: 'border-info-border bg-info-subtle text-info',
  primary: 'border-primary/30 bg-accent text-accent-foreground',
  neutral: 'border-border-strong bg-muted text-foreground',
};

interface FilterChipProps {
  tone: Tone;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

/** Toggleable status filter: "● 12 changed". Pressed state is exposed to assistive tech. */
export function FilterChip({ tone, label, count, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
        active
          ? TONE_ACTIVE[tone]
          : 'border-border bg-popover text-muted-foreground hover:border-border-strong hover:text-foreground',
      )}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE_MARK[tone])} aria-hidden />
      <span className="tabular-nums text-foreground">{count}</span>
      {label}
    </button>
  );
}

/** Static legend entry matching FilterChip's marker. */
export function LegendItem({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE_MARK[tone])} aria-hidden />
      {children}
    </span>
  );
}
