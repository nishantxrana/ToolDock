import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';

interface SectionCardProps {
  title?: ReactNode;
  /** One line under the title explaining what this panel is for. */
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      {(title || actions) && (
        <CardHeader className="flex min-h-12 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 space-y-0 border-b border-border-subtle px-4 py-2.5">
          <div className="min-w-0">
            {title && (
              <CardTitle className="font-display text-sm font-semibold leading-snug tracking-normal">
                {title}
              </CardTitle>
            )}
            {description && (
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={cn('p-4', contentClassName)}>{children}</CardContent>
    </Card>
  );
}
