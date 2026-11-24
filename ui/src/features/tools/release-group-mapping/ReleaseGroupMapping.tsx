import { useState } from 'react';
import { RefreshCw, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { DownloadPanel } from '@/components/common/DownloadPanel';
import { Field } from '@/components/common/Field';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PageLayout } from '@/components/common/PageLayout';
import { SectionCard } from '@/components/common/SectionCard';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { RequireProject } from '@/components/common/RequireProject';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { safeFilename } from '@/lib/utils/download';
import { exportReleaseMappingXlsx, type ReleaseMappingRow } from '@/lib/utils/xlsx';
import { useReleaseMapping } from '@/lib/hooks/useReleaseMapping';
import { useSessionStore } from '@/store/sessionStore';
import { ProgressBar } from '@/components/common/ProgressBar';

export function ReleaseGroupMapping() {
  const organization = useSessionStore((s) => s.organization);
  const project = useSessionStore((s) => s.selectedProject);
  const { data, isLoading, isError, error, refetch, isFetching } = useReleaseMapping();

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const variableGroups = data?.variableGroups ?? [];
  const groupOptions = variableGroups.map((g) => ({ value: String(g.id), label: g.name }));
  const mapping = data?.mapping ?? new Map();
  const progress = data?.progress;

  const selectedUsages = selectedGroupId !== null ? (mapping.get(selectedGroupId) ?? []) : null;
  const selectedGroupName = variableGroups.find((g) => g.id === selectedGroupId)?.name ?? '';

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const rows: ReleaseMappingRow[] = [];
      const sortedGroups = [...variableGroups].sort((a, b) => a.name.localeCompare(b.name));

      for (const vg of sortedGroups) {
        const usages = mapping.get(vg.id) ?? [];
        if (usages.length === 0) {
          rows.push({ groupName: vg.name, pipelineName: '-', stageName: '-', scope: 'Not used' });
        } else {
          const sorted = [...usages].sort((a, b) => a.pipelineName.localeCompare(b.pipelineName));
          for (const u of sorted) {
            rows.push({
              groupName: vg.name,
              pipelineName: u.pipelineName,
              stageName: u.stageName ?? '(all stages)',
              scope: u.scope,
            });
          }
        }
      }

      const orgPart = safeFilename(organization ?? '');
      const projectPart = safeFilename(project?.name ?? '');
      const filename = `${orgPart}-${projectPart}-release-pipeline-mapping.xlsx`;
      const title = `Release Pipeline Mapping - ${organization} / ${project?.name}`;
      await exportReleaseMappingXlsx(filename, title, rows);
    } catch (err) {
      toast.error('Couldn’t create the workbook', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExporting(false);
    }
  };

  const usages = selectedUsages
    ? [...selectedUsages].sort((a, b) => a.pipelineName.localeCompare(b.pipelineName))
    : null;
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 8;

  return (
    <RequireProject>
      <PageLayout
        title="Release Pipeline Mapping"
        description="See which release pipelines and stages use each variable group, or download the whole cross-reference as an Excel sheet."
        icon={Workflow}
      >
        {isLoading && (
          <SectionCard title="Reading release pipelines">
            <div className="space-y-2" role="status" aria-live="polite">
              <ProgressBar value={pct} label="Reading release pipelines" />
              <p className="text-13 text-muted-foreground">
                {progress && progress.total > 0
                  ? `${progress.done} of ${progress.total} pipelines read`
                  : 'Listing pipelines'}
              </p>
            </div>
          </SectionCard>
        )}

        {isError && (
          <>
            <ErrorBanner error={error} onRetry={() => refetch()} />
            <p className="text-13 text-muted-foreground">
              This tool also needs the <strong className="text-foreground">Release (Read)</strong>{' '}
              scope on your token. A 403 error usually means it is missing.
            </p>
          </>
        )}

        {!isLoading && !isError && data && (
          <>
            {variableGroups.length === 0 ? (
              <EmptyState
                icon={Workflow}
                title="No variable groups in this project"
                description="There is nothing to map yet. If you expected groups here, check that your token has Variable Groups read access."
              />
            ) : (
              <>
                <SectionCard title="Look up a variable group">
                  <Field label="Variable group" className="max-w-md">
                    <Combobox
                      options={groupOptions}
                      value={selectedGroupId !== null ? String(selectedGroupId) : undefined}
                      onChange={(v) => setSelectedGroupId(Number(v))}
                      placeholder="Choose a variable group"
                      searchPlaceholder="Search groups"
                    />
                  </Field>
                </SectionCard>

                {usages !== null && (
                  <SectionCard
                    title={`Pipelines using ${selectedGroupName}`}
                    description={
                      usages.length > 0
                        ? `${usages.length} link${usages.length === 1 ? '' : 's'}`
                        : undefined
                    }
                    contentClassName={usages.length > 0 ? 'p-0' : undefined}
                  >
                    {usages.length === 0 ? (
                      <EmptyState
                        icon={Workflow}
                        title="Not linked to any release pipeline"
                        description="It may still be used by YAML pipelines, which this tool doesn’t read."
                      />
                    ) : (
                      <div className="max-h-[28rem] overflow-auto scrollbar-thin">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="pl-4">Pipeline</TableHead>
                              <TableHead>Stage</TableHead>
                              <TableHead>Linked at</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {usages.map((u, i) => (
                              <TableRow key={i}>
                                <TableCell className="pl-4 font-medium">{u.pipelineName}</TableCell>
                                <TableCell className="text-muted-foreground">
                                  {u.stageName ?? 'All stages'}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      u.scope === 'Definition-level' ? 'secondary' : 'default'
                                    }
                                  >
                                    {u.scope === 'Definition-level' ? 'Pipeline' : 'Stage'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </SectionCard>
                )}

                <SectionCard title="Full mapping">
                  <DownloadPanel
                    filename={`${safeFilename(organization ?? '')}-${safeFilename(project?.name ?? '')}-release-pipeline-mapping.xlsx`}
                    detail="Every variable group with every pipeline and stage that uses it, in one sheet"
                    busy={exporting}
                    disabled={isFetching}
                    onDownload={handleExport}
                    extraActions={
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => refetch()}
                            disabled={isFetching}
                            aria-label="Read pipelines again"
                          >
                            <RefreshCw className={isFetching ? 'animate-spin' : ''} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Read pipelines again</TooltipContent>
                      </Tooltip>
                    }
                  />
                </SectionCard>
              </>
            )}
          </>
        )}
      </PageLayout>
    </RequireProject>
  );
}
