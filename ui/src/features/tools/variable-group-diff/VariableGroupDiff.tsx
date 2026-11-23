import { useMemo, useState } from 'react';
import { ArrowLeftRight, Diff, Download, Loader2, X } from 'lucide-react';
import { PageLayout } from '@/components/common/PageLayout';
import { SearchBox } from '@/components/common/SearchBox';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { EmptyState } from '@/components/common/EmptyState';
import { RequireProject } from '@/components/common/RequireProject';
import { FilterChip, LegendItem } from '@/components/common/FilterChip';
import { TONE_MARK, type Tone } from '@/lib/utils/tone';
import { ValueCell } from '@/components/common/ValueCell';
import { Field } from '@/components/common/Field';
import { pluralVars } from '@/lib/utils/variables';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import { diffGroups, type DiffRow, type DiffStatus } from '@/lib/utils/groupDiff';
import { exportDiffXlsx } from '@/lib/utils/xlsx';
import { variableCount } from '@/lib/utils/variables';
import { safeFilename } from '@/lib/utils/download';
import { useVariableGroups } from '@/lib/hooks/useVariableGroups';
import { cn } from '@/lib/utils/cn';
import type { VariableGroup } from '@/types/ado';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Status config: one tone per status, shared by row markers, chips and legend
// ---------------------------------------------------------------------------

const STATUSES: { id: DiffStatus; label: string; tone: Tone; hint: string }[] = [
  { id: 'changed', label: 'changed', tone: 'warning', hint: 'Value differs' },
  { id: 'left-only', label: 'only in A', tone: 'destructive', hint: 'Missing from B' },
  { id: 'right-only', label: 'only in B', tone: 'destructive', hint: 'Missing from A' },
  { id: 'both-secret', label: 'both secret', tone: 'info', hint: 'Values can’t be read' },
  { id: 'identical', label: 'identical', tone: 'neutral', hint: 'Same value' },
];
const STATUS_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s])) as Record<
  DiffStatus,
  (typeof STATUSES)[number]
>;

const ROW_TINT: Partial<Record<DiffStatus, string>> = {
  changed: 'bg-warning/[0.05]',
  'left-only': 'bg-destructive/[0.04]',
  'right-only': 'bg-destructive/[0.04]',
};

// ---------------------------------------------------------------------------
// Side label: "A" / "B" marker used in the pickers and column headers
// ---------------------------------------------------------------------------

function SideMark({ side }: { side: 'A' | 'B' }) {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-muted font-display text-xs font-bold text-foreground"
      aria-hidden
    >
      {side}
    </span>
  );
}

function GroupSlot({
  side,
  group,
  options,
  onPick,
  onClear,
}: {
  side: 'A' | 'B';
  group: VariableGroup | null;
  options: VariableGroup[];
  onPick: (g: VariableGroup) => void;
  onClear: () => void;
}) {
  if (group) {
    return (
      <div className="flex h-9 min-w-0 items-center gap-2 rounded-md border bg-popover pl-2 pr-1">
        <SideMark side={side} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={group.name}>
          {group.name}
        </span>
        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
          {pluralVars(variableCount(group))}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={onClear}
          aria-label={`Change group ${side}`}
        >
          <X />
        </Button>
      </div>
    );
  }
  return (
    <Field label={`Group ${side}`} className="[&>label]:sr-only">
      <Combobox
        options={options.map((g) => ({
          value: String(g.id),
          label: g.name,
          description: pluralVars(variableCount(g)),
        }))}
        onChange={(v) => {
          const g = options.find((x) => x.id === Number(v));
          if (g) onPick(g);
        }}
        placeholder={`Choose group ${side}`}
        searchPlaceholder="Search groups"
      />
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Diff table
// ---------------------------------------------------------------------------

function DiffTable({
  rows,
  leftName,
  rightName,
}: {
  rows: DiffRow[];
  leftName: string;
  rightName: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        No keys match these filters.
      </p>
    );
  }

  const head =
    'sticky top-0 z-10 h-9 border-b bg-muted px-3 text-left align-middle text-xs font-semibold text-muted-foreground';

  return (
    <table className="w-full border-separate border-spacing-0 text-13">
      <thead>
        <tr>
          <th className={cn(head, 'w-[30%] pl-5')}>Key</th>
          <th className={cn(head, 'w-[35%]')}>
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <SideMark side="A" />
              <span className="truncate">{leftName}</span>
            </span>
          </th>
          <th className={cn(head, 'w-[35%]')}>
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <SideMark side="B" />
              <span className="truncate">{rightName}</span>
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const s = STATUS_BY_ID[row.status];
          const cell = 'border-b border-border-subtle px-3 py-2 align-top';
          return (
            <tr key={row.key} className={cn('group hover:bg-row-hover', ROW_TINT[row.status])}>
              <td className={cn(cell, 'relative pl-5')}>
                <span
                  className={cn(
                    'absolute inset-y-1.5 left-1.5 w-[3px] rounded-full',
                    row.status === 'identical' ? 'bg-transparent' : TONE_MARK[s.tone],
                  )}
                  aria-hidden
                />
                <span className="sr-only">{s.hint}: </span>
                <span className="font-mono text-xs font-medium [overflow-wrap:anywhere]">
                  {row.key}
                </span>
              </td>
              <td className={cell}>
                <ValueCell
                  value={row.leftValue}
                  secret={row.leftSecret}
                  absent={row.status === 'right-only'}
                />
              </td>
              <td className={cell}>
                <ValueCell
                  value={row.rightValue}
                  secret={row.rightSecret}
                  absent={row.status === 'left-only'}
                  className={row.status === 'changed' ? 'text-warning' : undefined}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VariableGroupDiff() {
  const [leftGroup, setLeftGroup] = useState<VariableGroup | null>(null);
  const [rightGroup, setRightGroup] = useState<VariableGroup | null>(null);
  const [filter, setFilter] = useState('');
  const [activeStatuses, setActiveStatuses] = useState<Set<DiffStatus>>(new Set());
  const [exporting, setExporting] = useState(false);

  const { data: allGroups, isLoading, isError, error, refetch } = useVariableGroups();
  const groups = useMemo(() => allGroups ?? [], [allGroups]);

  const result = useMemo(
    () => (leftGroup && rightGroup ? diffGroups(leftGroup.variables, rightGroup.variables) : null),
    [leftGroup, rightGroup],
  );

  const countOf = (s: DiffStatus) => {
    if (!result) return 0;
    const c = result.counts;
    return {
      identical: c.identical,
      changed: c.changed,
      'left-only': c.leftOnly,
      'right-only': c.rightOnly,
      'both-secret': c.bothSecret,
    }[s];
  };

  const filteredRows = useMemo(() => {
    if (!result) return [];
    let rows = result.rows;
    if (activeStatuses.size > 0) rows = rows.filter((r) => activeStatuses.has(r.status));
    const q = filter.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.key.toLowerCase().includes(q));
    return rows;
  }, [result, activeStatuses, filter]);

  const toggleStatus = (s: DiffStatus) =>
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const differences = result
    ? result.counts.changed + result.counts.leftOnly + result.counts.rightOnly
    : 0;

  const swap = () => {
    setLeftGroup(rightGroup);
    setRightGroup(leftGroup);
  };

  const handleExport = async () => {
    if (!result || !leftGroup || !rightGroup) return;
    setExporting(true);
    try {
      await exportDiffXlsx(
        `${safeFilename(leftGroup.name)}-vs-${safeFilename(rightGroup.name)}-diff.xlsx`,
        leftGroup.name,
        rightGroup.name,
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
        title="Variable Group Diff"
        description="Compare two variable groups key by key. Changed values, keys missing on one side, and secrets are marked."
        icon={Diff}
        variant="fill"
      >
        {isError && <ErrorBanner error={error} onRetry={() => refetch()} />}
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <Skeleton className="h-9" />
            <span />
            <Skeleton className="h-9" />
          </div>
        ) : (
          <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <GroupSlot
              side="A"
              group={leftGroup}
              options={groups.filter((g) => g.id !== rightGroup?.id)}
              onPick={setLeftGroup}
              onClear={() => setLeftGroup(null)}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={swap}
              disabled={!leftGroup && !rightGroup}
              aria-label="Swap A and B"
              className="justify-self-center text-muted-foreground"
            >
              <ArrowLeftRight />
            </Button>
            <GroupSlot
              side="B"
              group={rightGroup}
              options={groups.filter((g) => g.id !== leftGroup?.id)}
              onPick={setRightGroup}
              onClear={() => setRightGroup(null)}
            />
          </div>
        )}

        {!result || !leftGroup || !rightGroup ? (
          <EmptyState
            icon={Diff}
            title="Choose two groups to compare"
            description="Pick group A and group B above, for example your dev and prod groups. Every key appears once, with both values side by side."
          />
        ) : (
          <div className="flex min-h-[24rem] flex-1 flex-col overflow-hidden rounded-lg border bg-card shadow-card">
            {/* Summary + filters */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2.5">
              <p className="mr-1 text-sm font-semibold" role="status">
                {differences === 0 ? (
                  <span className="text-success">No differences</span>
                ) : (
                  <span>
                    {differences} difference{differences === 1 ? '' : 's'}
                  </span>
                )}
              </p>
              {STATUSES.map(
                (s) =>
                  countOf(s.id) > 0 && (
                    <FilterChip
                      key={s.id}
                      tone={s.tone}
                      label={s.label}
                      count={countOf(s.id)}
                      active={activeStatuses.has(s.id)}
                      onClick={() => toggleStatus(s.id)}
                    />
                  ),
              )}
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
              <DiffTable
                rows={filteredRows}
                leftName={leftGroup.name}
                rightName={rightGroup.name}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border-subtle bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">
                {filteredRows.length === result.counts.total
                  ? `${result.counts.total} keys`
                  : `${filteredRows.length} of ${result.counts.total} keys`}
              </span>
              {STATUSES.filter((s) => s.id !== 'identical').map((s) => (
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
