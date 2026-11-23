import { useEffect, useMemo, useState } from 'react';
import { Boxes, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { SearchBox } from '@/components/common/SearchBox';
import { DownloadPanel } from '@/components/common/DownloadPanel';
import { pluralVars } from '@/lib/utils/variables';
import { Callout } from '@/components/common/Callout';
import { PageLayout } from '@/components/common/PageLayout';
import { SectionCard } from '@/components/common/SectionCard';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { RequireProject } from '@/components/common/RequireProject';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { safeFilename } from '@/lib/utils/download';
import { exportVariableGroupWorkbook } from '@/lib/utils/xlsx';
import { variableCount, variableEntries } from '@/lib/utils/variables';
import { useVariableGroups } from '@/lib/hooks/useVariableGroups';
import { useSessionStore } from '@/store/sessionStore';

/** Secret values cannot be read back from ADO; represented as a placeholder. */
const SECRET_PLACEHOLDER = '';

/** Tool - export every (or a chosen subset of) a project's variable groups into one multi-sheet XLSX workbook. */
export function ExportAllGroups() {
  const organization = useSessionStore((s) => s.organization);
  const project = useSessionStore((s) => s.selectedProject);
  const { data: groups, isLoading, isError, error, refetch } = useVariableGroups();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');

  // Pre-check every group the first time the list loads; leave user edits
  // alone on any later refetch.
  useEffect(() => {
    if (groups && !initialized) {
      setSelected(new Set(groups.map((g) => g.id)));
      setInitialized(true);
    }
  }, [groups, initialized]);

  const total = groups?.length ?? 0;
  const selectedGroups = (groups ?? []).filter((g) => selected.has(g.id));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? (groups ?? []).filter((g) => g.name.toLowerCase().includes(q)) : (groups ?? []);
  }, [groups, search]);

  // "Select all" operates on the filtered list - so when searching it only toggles visible items
  const allFilteredSelected = filtered.length > 0 && filtered.every((g) => selected.has(g.id));

  const hasSecrets = selectedGroups.some((g) => variableEntries(g).some((e) => e.isSecret));

  const toggleAll = () => {
    if (!groups) return;
    if (allFilteredSelected) {
      // Deselect only the filtered items, keep others
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((g) => next.delete(g.id));
        return next;
      });
    } else {
      // Select all filtered items (add to existing selection)
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((g) => next.add(g.id));
        return next;
      });
    }
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filename = project
    ? `${safeFilename(organization ? `${organization}-${project.name}` : project.name)}-variable-groups.xlsx`
    : 'variable-groups.xlsx';

  const handleExport = async () => {
    if (selectedGroups.length === 0) return;
    setExporting(true);
    try {
      await exportVariableGroupWorkbook(
        filename,
        selectedGroups.map((g) => ({
          name: g.name,
          rows: variableEntries(g).map((e) => ({
            key: e.key,
            value: e.value ?? SECRET_PLACEHOLDER,
          })),
        })),
      );
    } catch (err) {
      toast.error('Couldn’t create the workbook', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <RequireProject>
      <PageLayout
        title="Export All Variable Groups"
        description="Download a project's variable groups as one Excel workbook, with a sheet per group. All groups are selected to start with."
        icon={Layers}
      >
        {isLoading && <Skeleton className="h-64 w-full" />}
        {isError && <ErrorBanner error={error} onRetry={() => refetch()} />}

        {!isLoading && !isError && total === 0 && (
          <EmptyState
            icon={Boxes}
            title="No variable groups in this project"
            description="Create one in Azure DevOps under Pipelines, Library. If you expected some here, check that your token has Variable Groups read access."
          />
        )}

        {!isLoading && !isError && total > 0 && groups && (
          <>
            <SectionCard
              title="Groups to include"
              description={`${selected.size} of ${total} selected`}
              actions={
                <SearchBox
                  value={search}
                  onChange={setSearch}
                  placeholder="Filter groups"
                  className="w-full sm:w-56"
                />
              }
              contentClassName="p-0"
            >
              <label className="flex cursor-pointer items-center gap-3 border-b border-border-subtle bg-muted/50 px-4 py-2 text-13 font-medium">
                <Checkbox
                  checked={
                    allFilteredSelected
                      ? true
                      : filtered.some((g) => selected.has(g.id))
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={toggleAll}
                />
                {search
                  ? `Select the ${filtered.length} matching group${filtered.length === 1 ? '' : 's'}`
                  : 'Select all'}
              </label>

              {filtered.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No group name contains “{search}”.
                </p>
              ) : (
                <ul className="max-h-80 overflow-y-auto scrollbar-thin">
                  {filtered.map((g) => (
                    <li key={g.id}>
                      <label className="flex cursor-pointer items-center gap-3 border-b border-border-subtle px-4 py-2 text-sm last:border-0 hover:bg-row-hover">
                        <Checkbox
                          checked={selected.has(g.id)}
                          onCheckedChange={() => toggleOne(g.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">{g.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {pluralVars(variableCount(g))}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {hasSecrets && (
              <Callout variant="info">
                Secret values can’t be read from Azure DevOps, so they are exported empty.
              </Callout>
            )}

            <SectionCard title="Excel workbook">
              <DownloadPanel
                filename={filename}
                detail={`${selected.size} sheet${selected.size === 1 ? '' : 's'}, one per group`}
                busy={exporting}
                disabled={selected.size === 0}
                disabledHint="Select at least one group to export."
                onDownload={handleExport}
              />
            </SectionCard>
          </>
        )}
      </PageLayout>
    </RequireProject>
  );
}
