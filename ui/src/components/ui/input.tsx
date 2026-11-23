import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/** Shared field chrome - also used by Textarea, Combobox trigger and Select trigger. */
export const fieldClasses =
  'w-full rounded-md border border-input bg-popover text-sm text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 hover:border-border-strong focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50';

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(fieldClasses, 'flex h-9 px-3 py-1', className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
