import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ValueCellProps {
  value: string | null | undefined;
  secret?: boolean;
  /** The key does not exist on this side. */
  absent?: boolean;
  className?: string;
}

/** One variable value in a comparison table, with distinct treatments for secret / empty / absent. */
export function ValueCell({ value, secret, absent, className }: ValueCellProps) {
  if (absent)
    return (
      <span className="select-none text-xs italic text-muted-foreground" aria-label="Not present">
        not set
      </span>
    );
  if (secret)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-info">
        <Lock className="h-3 w-3 shrink-0" aria-hidden />
        secret
      </span>
    );
  if (!value) return <span className="text-xs italic text-muted-foreground">empty</span>;
  return (
    <span
      className={cn('font-mono text-xs leading-relaxed [overflow-wrap:anywhere]', className)}
      title={value}
    >
      {value}
    </span>
  );
}
