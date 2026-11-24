import { useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  RotateCcw,
  Table2,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/common/Callout';
import { downloadText, safeFilename } from '@/lib/utils/download';
import { exportMigrationReportXlsx } from '@/lib/utils/xlsx';
import {
  groupBySeverity,
  reportToCsv,
  reportToMarkdown,
  SEVERITY_LABEL,
  type ReportItem,
} from '@/lib/migration/report';
import { ReportList } from './Wizard';
import type { Counts } from '../useMigrationRun';

interface ReportViewProps {
  title: string;
  source: string;
  target: string;
  counts: Counts;
  items: ReportItem[];
  failures: { label: string; message: string }[];
  cancelled?: boolean;
  onRetry?: () => void;
}

/** Final report: summary, a to-do checklist with links, and downloads. */
export function ReportView({
  title,
  source,
  target,
  counts,
  items,
  failures,
  cancelled,
  onRetry,
}: ReportViewProps) {
  const [busy, setBusy] = useState(false);
  const g = groupBySeverity(items);
  const header = { title, source, target, finishedAt: new Date(), counts, failures };
  const base = safeFilename(`${title} report ${new Date().toISOString().slice(0, 10)}`);

  const xlsx = async () => {
    setBusy(true);
    try {
      await exportMigrationReportXlsx(`${base}.xlsx`, {
        title,
        summary: [
          ['Source', source],
          ['Target', target],
          ['Finished', header.finishedAt.toLocaleString()],
          ['Copied', String(counts.ok)],
          ['With warnings', String(counts.warning)],
          ['Skipped', String(counts.skipped)],
          ['Failed', String(counts.failed)],
          ['To do', String(g.action.length)],
        ],
        sheets: [
          { name: SEVERITY_LABEL.action, tone: 'action', rows: g.action },
          { name: SEVERITY_LABEL.warning, tone: 'warning', rows: g.warning },
          { name: SEVERITY_LABEL.info, tone: 'info', rows: g.info },
          {
            name: 'Failed',
            tone: 'failed',
            rows: failures.map((f) => ({ area: '', title: f.label, detail: f.message })),
          },
        ],
      });
    } catch (e) {
      toast.error('Could not build the workbook', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Copied', value: counts.ok, icon: CheckCircle2, tone: 'text-success' },
          {
            label: 'With warnings',
            value: counts.warning,
            icon: TriangleAlert,
            tone: 'text-warning',
          },
          {
            label: 'Skipped',
            value: counts.skipped,
            icon: RotateCcw,
            tone: 'text-muted-foreground',
          },
          { label: 'Failed', value: counts.failed, icon: XCircle, tone: 'text-destructive' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-card px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <s.icon className={`h-3.5 w-3.5 ${s.tone}`} />
              {s.label}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {cancelled && (
        <Callout variant="warning" title="Stopped before the end">
          Everything finished so far is kept. Run it again to continue; finished items are skipped.
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
        <p className="mr-auto text-13">
          <span className="font-semibold">{g.action.length}</span> thing
          {g.action.length === 1 ? '' : 's'} left for you to do. Download the report to share it or
          work through it later.
        </p>
        <Button variant="outline" size="sm" onClick={xlsx} disabled={busy}>
          <Table2 />
          Excel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadText(`${base}.md`, reportToMarkdown(header, items), 'text/markdown')
          }
        >
          <FileText />
          Markdown
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadText(`${base}.csv`, reportToCsv(items), 'text/csv')}
        >
          <Download />
          CSV
        </Button>
      </div>

      {failures.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-13 font-semibold text-destructive">Failed ({failures.length})</h3>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RotateCcw />
                Retry failed
              </Button>
            )}
          </div>
          <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-destructive-border">
            {failures.slice(0, 100).map((f, i) => (
              <li key={i} className="bg-destructive-subtle/40 px-3 py-2 text-13">
                <p className="font-medium">{f.label}</p>
                <p className="break-words text-muted-foreground">{f.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ReportList items={items} checklist />
    </div>
  );
}
