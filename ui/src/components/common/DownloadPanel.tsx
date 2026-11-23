import type { ReactNode } from 'react';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DownloadPanelProps {
  filename: string;
  /** What the file contains, e.g. "3 sheets, one per group". */
  detail?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  /** Shown instead of the filename while nothing can be downloaded. */
  disabledHint?: string;
  label?: string;
  onDownload: () => void;
  extraActions?: ReactNode;
}

/** A file ready to download: icon, filename, what's in it, and the button. */
export function DownloadPanel({
  filename,
  detail,
  busy,
  disabled,
  disabledHint,
  label = 'Download',
  onDownload,
  extraActions,
}: DownloadPanelProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-success-border bg-success-subtle text-success">
          <FileSpreadsheet className="h-5 w-5" />
        </span>
        {disabled && disabledHint ? (
          <p className="text-sm text-muted-foreground">{disabledHint}</p>
        ) : (
          <div className="min-w-0">
            <p className="truncate font-mono text-13 font-medium" title={filename}>
              {filename}
            </p>
            {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {extraActions}
        <Button onClick={onDownload} disabled={disabled || busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />}
          {busy ? 'Preparing…' : label}
        </Button>
      </div>
    </div>
  );
}
