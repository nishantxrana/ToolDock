import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ToolHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
}

/** Title block shared by every tool page. */
export function ToolHeader({ title, description, icon: Icon, actions }: ToolHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-accent text-accent-foreground">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
          {description && (
            <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

interface PageLayoutProps extends ToolHeaderProps {
  children: ReactNode;
  /**
   * "fill" pins the header and controls and lets the last child take the
   * remaining height and scroll on its own (used by the comparison tables).
   */
  variant?: 'flow' | 'fill';
}

export function PageLayout({ children, variant = 'flow', ...header }: PageLayoutProps) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8',
        variant === 'fill' && 'h-full min-h-0',
      )}
    >
      <ToolHeader {...header} />
      <div className={cn('flex flex-col gap-5', variant === 'fill' && 'min-h-0 flex-1')}>
        {children}
      </div>
    </div>
  );
}
