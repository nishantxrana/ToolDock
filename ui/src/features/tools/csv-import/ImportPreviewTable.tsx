import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { SearchBox } from '@/components/common/SearchBox';
import { FilterChip } from '@/components/common/FilterChip';
import type { Tone } from '@/lib/utils/tone';
import { ValueCell } from '@/components/common/ValueCell';
import { cn } from '@/lib/utils/cn';
import type { ImportRow, ImportStatus } from './importDiff';

const STATUS_META: Record<
  ImportStatus,
  { label: string; chip: string; variant: BadgeProps['variant']; tone: Tone }
> = {
  overwrite: { label: 'Overwrite', chip: 'overwrite', variant: 'warning', tone: 'warning' },
  new: { label: 'New', chip: 'new', variant: 'success', tone: 'success' },
  same: { label: 'Unchanged', chip: 'unchanged', variant: 'secondary', tone: 'neutral' },
};

interface ImportPreviewTableProps {
  rows: ImportRow[];
  /** Only these statuses are shown. Empty = all. */
  statuses?: Set<ImportStatus>;
  search?: string;
  className?: string;
}

/** Per-key preview: current value, incoming value, and what will happen. */
export function ImportPreviewTable({
  rows,
  statuses,
  search = '',
  className,
}: ImportPreviewTableProps) {
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!statuses || statuses.size === 0 || statuses.has(r.status)) &&
        (!q || r.key.toLowerCase().includes(q)),
    );
  }, [rows, statuses, search]);

  return (
    <div className={cn('max-h-[440px] overflow-auto rounded-md border scrollbar-thin', className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[30%]">Variable</TableHead>
            <TableHead>Current value</TableHead>
            <TableHead>From CSV</TableHead>
            <TableHead className="w-28 text-right">Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                No rows match these filters.
              </TableCell>
            </TableRow>
          ) : (
            visible.map((row) => {
              const meta = STATUS_META[row.status];
              return (
                <TableRow
                  key={row.key}
                  className={cn(row.status === 'overwrite' && 'bg-warning/[0.05]')}
                >
                  <TableCell className="break-all font-mono text-xs font-medium">
                    {row.key}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <ValueCell
                      value={row.current}
                      secret={row.currentIsSecret}
                      absent={row.current === null && !row.currentIsSecret}
                      className={
                        row.status === 'overwrite'
                          ? 'line-through decoration-warning/60'
                          : undefined
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <ValueCell value={row.incoming} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/** Status filter chips + key search over the preview table. Starts on "changes only". */
export function ImportPreviewTableWithControls({ rows }: { rows: ImportRow[] }) {
  const counts = useMemo(() => {
    const c: Record<ImportStatus, number> = { overwrite: 0, new: 0, same: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const [statuses, setStatuses] = useState<Set<ImportStatus>>(
    () => new Set(counts.overwrite + counts.new > 0 ? ['overwrite', 'new'] : []),
  );
  const [search, setSearch] = useState('');

  const toggle = (s: ImportStatus) =>
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(STATUS_META) as ImportStatus[]).map(
          (s) =>
            counts[s] > 0 && (
              <FilterChip
                key={s}
                tone={STATUS_META[s].tone}
                label={STATUS_META[s].chip}
                count={counts[s]}
                active={statuses.has(s)}
                onClick={() => toggle(s)}
              />
            ),
        )}
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Filter keys"
          className="ml-auto w-full sm:w-56"
        />
      </div>
      <ImportPreviewTable rows={rows} statuses={statuses} search={search} />
    </div>
  );
}
