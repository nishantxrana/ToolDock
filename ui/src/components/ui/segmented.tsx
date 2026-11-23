import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label is an icon. */
  ariaLabel?: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Group label for assistive tech. */
  label: string;
  size?: 'sm' | 'xs';
  className?: string;
}

/** Single-choice segmented control (radio group semantics). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'sm',
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-md border border-border bg-muted p-0.5', className)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const next =
          options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
        if (next) {
          onChange(next.value);
          (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement)?.focus();
        }
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            data-value={o.value}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium transition-colors [&_svg]:size-3.5',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-6 px-1.5 text-xs',
              active
                ? 'bg-popover text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.12)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
