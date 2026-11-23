import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 text-xs font-medium tabular-nums',
  {
    variants: {
      variant: {
        default: 'border-primary/25 bg-accent text-accent-foreground',
        secondary: 'border-border bg-muted text-muted-foreground',
        success: 'border-success-border bg-success-subtle text-success',
        warning: 'border-warning-border bg-warning-subtle text-warning',
        destructive: 'border-destructive-border bg-destructive-subtle text-destructive',
        info: 'border-info-border bg-info-subtle text-info',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
