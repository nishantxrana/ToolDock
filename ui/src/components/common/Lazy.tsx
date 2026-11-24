import { Suspense, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/** Suspense boundary for lazily loaded pages. */
export function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-2 py-24 text-13 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
