import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { fieldClasses } from './input';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        spellCheck={false}
        className={cn(
          fieldClasses,
          'flex min-h-[140px] resize-y px-3 py-2.5 font-mono text-13 leading-relaxed scrollbar-thin',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
