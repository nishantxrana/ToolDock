import type { ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils/cn';

export interface Choice<T extends string> {
  value: T;
  label: string;
  detail?: string;
}

/** A labelled set of radio cards for one option. */
export function ChoiceGroup<T extends string>({
  label,
  hint,
  value,
  onChange,
  choices,
  disabled,
}: {
  label: string;
  hint?: ReactNode;
  value: T;
  onChange: (v: T) => void;
  choices: Choice<T>[];
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-13 font-semibold">{label}</legend>
      {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {choices.map((c) => {
          const active = c.value === value;
          return (
            <label
              key={c.value}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-13 transition-colors',
                active ? 'border-primary bg-accent' : 'hover:border-border-strong',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                className="mt-0.5 accent-[hsl(var(--primary))]"
                checked={active}
                onChange={() => onChange(c.value)}
              />
              <span>
                <span className="block font-medium">{c.label}</span>
                {c.detail && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{c.detail}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** One on/off option with an explanation. */
export function ToggleRow({
  label,
  detail,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  detail?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex items-start justify-between gap-4 rounded-lg border px-3 py-2.5',
        disabled && 'opacity-60',
      )}
    >
      <span className="text-13">
        <span className="block font-medium">{label}</span>
        {detail && <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}
