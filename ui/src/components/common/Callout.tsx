import type { LucideIcon } from 'lucide-react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface CalloutProps {
  variant: 'info' | 'warning' | 'danger' | 'success';
  icon?: LucideIcon;
  /** Optional bold first line, coloured by variant. Body text stays at full contrast. */
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

const variantStyles = {
  info: { box: 'border-info-border bg-info-subtle', accent: 'text-info' },
  warning: { box: 'border-warning-border bg-warning-subtle', accent: 'text-warning' },
  danger: { box: 'border-destructive-border bg-destructive-subtle', accent: 'text-destructive' },
  success: { box: 'border-success-border bg-success-subtle', accent: 'text-success' },
};

const defaultIcons: Record<CalloutProps['variant'], LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertCircle,
  success: CheckCircle2,
};

export function Callout({ variant, icon, title, children, className }: CalloutProps) {
  const Icon = icon ?? defaultIcons[variant];
  const s = variantStyles[variant];
  return (
    <div
      role={variant === 'danger' ? 'alert' : 'note'}
      className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', s.box, className)}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', s.accent)} />
      <div className="min-w-0 flex-1 space-y-1 leading-relaxed text-foreground">
        {title && <p className={cn('font-semibold', s.accent)}>{title}</p>}
        {children}
      </div>
    </div>
  );
}
