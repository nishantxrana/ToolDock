import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { errorMessage, errorTitle } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';

interface ErrorBannerProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

export function ErrorBanner({ error, onRetry, className }: ErrorBannerProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-lg border border-destructive-border bg-destructive-subtle px-4 py-3',
        className,
      )}
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-destructive">{errorTitle(error)}</p>
        <p className="mt-0.5 leading-relaxed text-foreground">{errorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw />
          Try again
        </Button>
      )}
    </div>
  );
}
