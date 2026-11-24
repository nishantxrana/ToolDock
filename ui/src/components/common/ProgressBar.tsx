import { cn } from '@/lib/utils/cn';

interface ProgressBarProps {
  /** 0–100. Null shows a short placeholder bar while the total is unknown. */
  value: number | null;
  tone?: 'primary' | 'success' | 'warning' | 'destructive';
  label?: string;
  className?: string;
}

const TONE = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
};

export function ProgressBar({ value, tone = 'primary', label, className }: ProgressBarProps) {
  const pct = value === null ? 8 : Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(pct)}
      className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300 ease-out', TONE[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
