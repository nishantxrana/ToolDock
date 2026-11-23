import { useId, type ReactElement, cloneElement } from 'react';
import { cn } from '@/lib/utils/cn';

interface FieldProps {
  label: string;
  hint?: string;
  /** The control. Receives an id so the label is associated with it. */
  children: ReactElement<{ id?: string }>;
  className?: string;
}

/** Label + control + optional hint, consistently spaced. */
export function Field({ label, hint, children, className }: FieldProps) {
  const id = useId();
  const controlId = children.props.id ?? id;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={controlId} className="text-13 font-medium text-foreground">
        {label}
      </label>
      {cloneElement(children, { id: controlId })}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
