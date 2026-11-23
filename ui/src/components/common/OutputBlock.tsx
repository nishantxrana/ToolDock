import type { ReactNode } from 'react';
import { Download } from 'lucide-react';
import { CopyButton } from './CopyButton';
import { Button } from '@/components/ui/button';
import { SectionCard } from './SectionCard';
import { downloadText } from '@/lib/utils/download';

interface OutputBlockProps {
  title?: string;
  description?: ReactNode;
  value: string;
  downloadName?: string;
  downloadMime?: string;
  actions?: ReactNode;
  emptyHint?: string;
}

/** Generated text with copy + download. Copy is the primary action. */
export function OutputBlock({
  title = 'Output',
  description,
  value,
  downloadName,
  downloadMime = 'text/plain',
  actions,
  emptyHint = 'Nothing to show yet.',
}: OutputBlockProps) {
  const hasValue = value.trim().length > 0;

  return (
    <SectionCard
      title={title}
      description={description}
      actions={
        <>
          {actions}
          {downloadName && (
            <Button
              variant="outline"
              size="sm"
              disabled={!hasValue}
              onClick={() => downloadText(downloadName, value, downloadMime)}
              title={`Download ${downloadName}`}
            >
              <Download />
              Download
            </Button>
          )}
          <CopyButton value={value} variant="default" disabled={!hasValue} />
        </>
      }
      contentClassName="p-0"
    >
      {hasValue ? (
        <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words bg-code-bg p-4 font-mono text-13 leading-relaxed scrollbar-thin">
          {value}
        </pre>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">{emptyHint}</p>
      )}
    </SectionCard>
  );
}
