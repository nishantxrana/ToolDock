import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useTheme } from '@/lib/utils/theme';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Toasts follow the app theme and use the same surface, border and type as the rest of the UI. */
function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            '!rounded-lg !border !border-border !bg-popover !text-popover-foreground !shadow-overlay !font-sans',
          title: '!text-sm !font-semibold',
          description: '!text-13 !text-muted-foreground',
          success: '[&_[data-icon]]:!text-success',
          error: '[&_[data-icon]]:!text-destructive',
          warning: '[&_[data-icon]]:!text-warning',
          info: '[&_[data-icon]]:!text-info',
          closeButton: '!border-border !bg-popover !text-muted-foreground hover:!text-foreground',
        },
      }}
    />
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250}>
        <RouterProvider router={router} />
        <ThemedToaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
