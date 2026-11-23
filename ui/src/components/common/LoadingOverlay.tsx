import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  message?: string;
}

/** Full-surface overlay shown during blocking mutations (e.g. CSV import). */
export function LoadingOverlay({ message = 'Working…' }: LoadingOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[hsl(var(--overlay-scrim))] backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-xl border bg-popover px-6 py-4 shadow-overlay">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-sm font-medium">{message}</p>
      </div>
    </div>
  );
}
