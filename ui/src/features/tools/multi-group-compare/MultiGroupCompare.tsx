import { useMemo, useState } from 'react';
import { Columns3, Download, Loader2, Plus, X } from 'lucide-react';
import { PageLayout } from '@/components/common/PageLayout';
import { SearchBox } from '@/components/common/SearchBox';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { EmptyState } from '@/components/common/EmptyState';
import { RequireProject } from '@/components/common/RequireProject';
import { FilterChip, LegendItem } from '@/components/common/FilterChip';
import { TONE_MARK, type Tone } from '@/lib/utils/tone';
import { ValueCell } from '@/components/common/ValueCell';
import { pluralVars } from '@/lib/utils/variables';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import { compareGroups, type CompareRow, type RowStatus } from '@/lib/utils/groupCompare';
import { exportMultiGroupXlsx } from '@/lib/utils/xlsx';
import { variableCount } from '@/lib/utils/variables';
import { safeFilename } from '@/lib/utils/download';
import { useVariableGroups } from '@/lib/hooks/useVariableGroups';
import { cn } from '@/lib/utils/cn';
import type { VariableGroup } from '@/types/ado';
import { toast } from 'sonner';

const MAX_GROUPS = 8;
const LETTERS = 'ABCDEFGH';

const STATUSES: { id: RowStatus; label: string; tone: Tone; hint: string }[] = [
  { id: 'conflict', label: 'conflicts', tone: 'warning', hint: 'Values differ between groups' },
  { id: 'partial', label: 'missing in some', tone: 'destructive', hint: 'Not set in every group' },
  { id: 'same', label: 'same everywhere', tone: 'neutral', hint: 'Same in every group' },
];

const ROW_TINT: Partial<Record<RowStatus, string>> = {
  conflict: 'bg-warning/[0.05]',
  partial: 'bg-destructive/[0.04]',
};
// The sticky key cell needs an opaque background, so the tint is layered on as an inset shadow.
const STICKY_TINT: Partial<Record<RowStatus, string>> = {
  conflict: 'shadow-[inset_0_0_0_999px_hsl(var(--warning)/0.05)]',
  partial: 'shadow-[inset_0_0_0_999px_hsl(var(--destructive)/0.04)]',
};

function Letter({ i }: { i: number }) {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-muted font-display text-xs font-bold text-foreground"
      aria-hidden
    >
      {LETTERS[i]}
    </span>
  );
}

function CompareTable({ rows, groups }: { rows: CompareRow[]; groups: VariableGroup[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        No keys match these filters.
      </p>
    );
  }
  const head =
    'sticky top-0 z-10 h-9 border-b bg-muted px-3 text-left align-middle text-xs font-semibold';
  const cell = 'border-b border-border-subtle px-3 py-2 align-top';

  return (
    <table className="w-full border-separate border-spacing-0 text-13">
      <thead>
        <tr>
          <th
            className={cn(
              head,
              'left-0 z-20 w-[250px] min-w-[220px] pl-5 text-muted-foreground md:sticky',
            )}
          >
            Key
          </th>
          {groups.map((g, i) => (
            <th key={g.id} className={cn(head, 'min-w-[170px]')}>
              <span className="inline-flex max-w-[220px] items-center gap-1.5">
                <Letter i={i} />
                <span className="truncate" title={g.name}>
                  {g.name}
                </span>
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const s = STATUSES.find((x) => x.id === row.rowStatus)!;
          // In a conflict row, highlight values that differ from the first present value.
          const first = row.cells.find((c) => c.status === 'value')?.value;
          return (
            <tr
              key={row.key}
              className={cn('group/row hover:bg-row-hover', ROW_TINT[row.rowStatus])}
            >
              <td
                className={cn(
                  cell,
                  'relative left-0 z-[1] bg-card pl-5 group-hover/row:bg-row-hover md:sticky',
                  STICKY_TINT[row.rowStatus],
                )}
              >
                <span
                  className={cn(
                    'absolute inset-y-1.5 left-1.5 w-[3px] rounded-full',
                    row.rowStatus === 'same' ? 'bg-transparent' : TONE_MARK[s.tone],
                  )}
                  aria-hidden
                />
                <span className="sr-only">{s.hint}: </span>
                <span className="font-mono text-xs font-medium [overflow-wrap:anywhere]">
                  {row.key}
                </span>
              </td>
              {row.cells.map((c, ci) => (
                <td key={ci} className={cell}>
                  <ValueCell
                    value={c.value}
                    secret={c.status === 'secret'}
                    absent={c.status === 'missing'}
                    className={
                      row.rowStatus === 'conflict' && c.status === 'value' && c.value !== first
                        ? 'text-warning'
                        : row.rowStatus === 'same'
                          ? 'text-muted-foreground'
                          : undefined
                    }
                  />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function MultiGroupCompare() {
  const [selectedGroups, setSelectedGroups] = useState<VariableGroup[]>([]);
  const [filter, setFilter] = useState('');
  const [activeStatuses, setActiveStatuses] = useState<Set<RowStatus>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);

  const { data: allGroups, isLoading, isError, error, refetch } = useVariableGroups();
  const groups = useMemo(() => allGroups ?? [], [allGroups]);

  const availableGroups = useMemo(
    () => groups.filter((g) => !selectedGroups.some((s) => s.id === g.id)),
    [groups, selectedGroups],
  );

  const addGroup = (id: string) => {
    const g = groups.find((x) => x.id === Number(id));
    if (g) setSelectedGroups((prev) => [...prev, g]);
    setPickerKey((k) => k + 1);
  };
  const removeGroup = (id: number) => setSelectedGroups((prev) => prev.filter((g) => g.id !== id));

  const result = useMemo(
    () => (selectedGroups.length < 2 ? null : compareGroups(selectedGroups)),
    [selectedGroups],
  );

  const filteredRows = useMemo(() => {
    if (!result) return [];
    let rows = result.rows;
    if (activeStatuses.size > 0) rows = rows.filter((r) => activeStatuses.has(r.rowStatus));
    const q = filter.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.key.toLowerCase().includes(q));
    return rows;
  }, [result, activeStatuses, filter]);

  const toggleStatus = (s: RowStatus) =>
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const handleExport = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const namePart = selectedGroups.map((g) => safeFilename(g.name)).join('-vs-');
      await exportMultiGroupXlsx(
        `${namePart}-compare.xlsx`,
        selectedGroups.map((g) => g.name),
        result.rows,
      );
    } catch (err) {
      toast.error('Couldn’t create the XLSX file', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <RequireProject>
      <PageLayout
        title="Multi-Group Compare"
        description={`Line up 2 to ${MAX_GROUPS} variable groups, one column each. Conflicting values and keys missing from some groups are marked.`}
        icon={Columns3}
        variant="fill"
      >
        {isError && <ErrorBanner error={error} onRetry={() => refetch()} />}
        {isLoading ? (
          <div className="flex gap-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-8 w-40" />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {selectedGroups.map((g, i) => (
              <span
                key={g.id}
                className="inline-flex h-8 max-w-[260px] items-center gap-2 rounded-md border bg-popover pl-1.5 pr-0.5 text-13"
              >
                <Letter i={i} />
                <span className="truncate font-medium" title={g.name}>
                  {g.name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {variableCount(g)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="h-6 w-6 text-muted-foreground"
                  onClick={() => removeGroup(g.id)}
                  aria-label={`Remove ${g.name}`}
                >
                  <X />
                </Button>
              </span>
            ))}

            {selectedGroups.length < MAX_GROUPS && availableGroups.length > 0 && (
              <div className="w-56">
                <Combobox
                  key={pickerKey}
                  options={availableGroups.map((g) => ({
                    value: String(g.id),
                    label: g.name,
                    description: pluralVars(variableCount(g)),
                  }))}
                  onChange={addGroup}
                  placeholder={selectedGroups.length === 0 ? 'Add a group' : 'Add another group'}
                  searchPlaceholder="Search groups"
                  className="h-8 border-dashed text-13"
                  contentClassName="w-72"
                />
              </div>
            )}
            {selectedGroups.length >= MAX_GROUPS && (
              <p className="text-xs text-muted-foreground">
                {MAX_GROUPS} groups is the most this view can show side by side.
              </p>
            )}
          </div>
        )}

        {!result ? (
          <EmptyState
            icon={Plus}
            title={selectedGroups.length === 1 ? 'Add one more group' : 'Add the groups to compare'}
            description="Each key becomes a row and each group a column, so you can see at a glance which environment has a different value or is missing a key."
          />
        ) : (
          <div className="flex min-h-[24rem] flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2.5">
              {STATUSES.map((s) => {
                const count = result.counts[s.id];
                return (
                  count > 0 && (
                    <FilterChip
                      key={s.id}
                      tone={s.tone}
                      label={s.label}
                      count={count}
                      active={activeStatuses.has(s.id)}
                      onClick={() => toggleStatus(s.id)}
                    />
                  )
                );
              })}
              <div className="ml-auto flex items-center gap-2">
                <SearchBox
                  value={filter}
                  onChange={setFilter}
                  placeholder="Filter keys"
                  className="w-full sm:w-48"
                />
                <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                  {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                  Export XLSX
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
              <CompareTable rows={filteredRows} groups={selectedGroups} />
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border-subtle bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">
                {filteredRows.length === result.counts.total
                  ? `${result.counts.total} keys`
                  : `${filteredRows.length} of ${result.counts.total} keys`}
              </span>
              {STATUSES.filter((s) => s.id !== 'same').map((s) => (
                <LegendItem key={s.id} tone={s.tone}>
                  {s.hint}
                </LegendItem>
              ))}
            </div>
          </div>
        )}
      </PageLayout>
    </RequireProject>
  );
}
