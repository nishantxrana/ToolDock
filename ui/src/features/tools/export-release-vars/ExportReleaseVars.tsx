import { useMemo, useState } from 'react';
import { Download, GitBranch, RefreshCw } from 'lucide-react';
import { DownloadPanel } from '@/components/common/DownloadPanel';
import { Field } from '@/components/common/Field';
import { pluralVars } from '@/lib/utils/variables';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { PageLayout } from '@/components/common/PageLayout';
import { SectionCard } from '@/components/common/SectionCard';
import { OutputBlock } from '@/components/common/OutputBlock';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { RequireProject } from '@/components/common/RequireProject';
import { FormatToggle } from '@/components/common/FormatToggle';
import { Callout } from '@/components/common/Callout';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { toKeyValueCsv } from '@/lib/utils/csv';
import { safeFilename } from '@/lib/utils/download';
import { exportKeyValueXlsx } from '@/lib/utils/xlsx';
import { getReleaseDefinition } from '@/lib/api/releaseDefinitions';
import { useReleaseDefinitions } from '@/lib/hooks/useReleaseDefinitions';
import { useSessionStore } from '@/store/sessionStore';
import type { ReleaseDefinition } from '@/types/ado';

type Format = 'csv' | 'json' | 'txt' | 'xlsx';

const FORMATS: { id: Format; label: string; mime: string; ext: string }[] = [
  { id: 'csv', label: 'CSV', mime: 'text/csv', ext: 'csv' },
  { id: 'json', label: 'JSON', mime: 'application/json', ext: 'json' },
  { id: 'txt', label: 'TXT', mime: 'text/plain', ext: 'txt' },
  {
    id: 'xlsx',
    label: 'XLSX',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
  },
];

const SECRET_PLACEHOLDER = '';
const DEFINITION_SCOPE = '__definition__';

interface KV {
  key: string;
  value: string;
  isSecret: boolean;
}

function extractVars(def: ReleaseDefinition, scopeId: string): KV[] {
  const source =
    scopeId === DEFINITION_SCOPE
      ? def.variables
      : (def.environments.find((e) => String(e.id) === scopeId)?.variables ?? {});

  return Object.entries(source ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      key,
      value: v.isSecret ? SECRET_PLACEHOLDER : (v.value ?? ''),
      isSecret: v.isSecret ?? false,
    }));
}

function buildOutput(vars: KV[], format: Exclude<Format, 'xlsx'>, scopeLabel: string): string {
  if (format === 'csv') return toKeyValueCsv(vars.map((v) => ({ key: v.key, value: v.value })));
  if (format === 'txt') return vars.map((v) => `${v.key}=${v.value}`).join('\n');
  // JSON - ADO-compatible variables object, ready to paste into a new variable group
  const variables: Record<string, { value: string; isSecret?: boolean }> = {};
  for (const v of vars) {
    variables[v.key] = v.isSecret ? { value: '', isSecret: true } : { value: v.value };
  }
  return JSON.stringify({ name: scopeLabel, variables }, null, 2);
}

export function ExportReleaseVars() {
  const organization = useSessionStore((s) => s.organization);
  const project = useSessionStore((s) => s.selectedProject);

  const {
    data: definitions,
    isLoading: defsLoading,
    isError: defsError,
    error: defsErr,
    refetch: defsRefetch,
  } = useReleaseDefinitions();

  const [selectedDefId, setSelectedDefId] = useState<number | null>(null);
  const [scopeId, setScopeId] = useState<string>(DEFINITION_SCOPE);
  const [format, setFormat] = useState<Format>('csv');
  const [xlsxExporting, setXlsxExporting] = useState(false);

  // Fetch full definition when one is selected
  const {
    data: def,
    isLoading: defLoading,
    isFetching: defFetching,
    isError: defError,
    error: defErr,
    refetch: defRefetch,
  } = useQuery({
    queryKey: ['releaseDefinition', organization, project?.id, selectedDefId],
    queryFn: ({ signal }) =>
      getReleaseDefinition(organization!, project!.name, selectedDefId!, signal),
    enabled: !!organization && !!project && selectedDefId !== null,
    staleTime: 5 * 60_000,
  });

  // Reset scope when pipeline changes
  const handleDefChange = (id: number) => {
    setSelectedDefId(id);
    setScopeId(DEFINITION_SCOPE);
  };

  const scopes = useMemo(() => {
    if (!def) return [];
    const varCount = (vars: Record<string, unknown> | undefined) => Object.keys(vars ?? {}).length;
    return [
      {
        id: DEFINITION_SCOPE,
        label: 'Whole pipeline (all stages)',
        count: varCount(def.variables),
      },
      ...def.environments.map((e) => ({
        id: String(e.id),
        label: `Stage: ${e.name}`,
        count: varCount(e.variables),
      })),
    ];
  }, [def]);

  const vars = useMemo(() => (def ? extractVars(def, scopeId) : []), [def, scopeId]);
  const hasSecrets = vars.some((v) => v.isSecret);

  const selectedDef = definitions?.find((d) => d.id === selectedDefId);
  const scopeLabel = scopes.find((s) => s.id === scopeId)?.label ?? '';
  const active = FORMATS.find((f) => f.id === format)!;

  const exportFilename = selectedDef
    ? safeFilename(
        organization
          ? `${organization}-${selectedDef.name}-${scopeLabel}`
          : `${selectedDef.name}-${scopeLabel}`,
      )
    : '';

  const output = useMemo(
    () => (def && format !== 'xlsx' ? buildOutput(vars, format, scopeLabel) : ''),
    [def, vars, format, scopeLabel],
  );

  const handleXlsxDownload = async () => {
    if (!def) return;
    setXlsxExporting(true);
    try {
      await exportKeyValueXlsx(
        `${exportFilename}.xlsx`,
        scopeLabel,
        vars.map((v) => ({ key: v.key, value: v.value })),
        { titleRow: false },
      );
    } catch (err) {
      toast.error('XLSX export failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setXlsxExporting(false);
    }
  };

  return (
    <RequireProject>
      <PageLayout
        title="Export Release Variables"
        description="Download the variables defined inline on a release pipeline, for the whole pipeline or one stage. Useful when moving them into a variable group."
        icon={GitBranch}
      >
        {/* Pipeline picker */}
        <SectionCard
          title="Release pipeline"
          actions={<FormatToggle formats={FORMATS} value={format} onChange={setFormat} />}
        >
          <div className="space-y-3">
            {defsLoading && <Skeleton className="h-9 w-full" />}
            {defsError && <ErrorBanner error={defsErr} onRetry={() => defsRefetch()} />}
            {!defsLoading &&
              !defsError &&
              (!definitions || definitions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This project has no classic release pipelines.
                </p>
              ) : (
                <Field label="Pipeline" className="max-w-md">
                  <Combobox
                    options={definitions.map((d) => ({ value: String(d.id), label: d.name }))}
                    value={selectedDefId !== null ? String(selectedDefId) : undefined}
                    onChange={(v) => handleDefChange(Number(v))}
                    placeholder="Choose a release pipeline"
                    searchPlaceholder="Search pipelines"
                  />
                </Field>
              ))}

            {/* Scope picker - shown after a pipeline is selected */}
            {defLoading && <Skeleton className="h-9 w-full" />}
            {defError && <ErrorBanner error={defErr} onRetry={() => defRefetch()} />}
            {def && scopes.length > 0 && (
              <div className="flex max-w-md items-end gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <span className="text-13 font-medium">Variables from</span>
                  <Select value={scopeId} onValueChange={setScopeId}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {scopes.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="flex w-full items-center justify-between gap-4">
                            <span>{s.label}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {pluralVars(s.count)}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => defRefetch()}
                      disabled={defFetching}
                      aria-label="Reload this pipeline"
                    >
                      <RefreshCw className={defFetching ? 'animate-spin' : ''} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reload this pipeline</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Results */}
        {def && (
          <>
            {hasSecrets && (
              <Callout variant="info">
                Secret values can’t be read from Azure DevOps, so they are exported empty.
              </Callout>
            )}

            {vars.length === 0 ? (
              <EmptyState
                icon={GitBranch}
                title="No inline variables here"
                description="This pipeline or stage gets its variables from linked variable groups. Release Pipeline Mapping shows which ones."
              />
            ) : format === 'xlsx' ? (
              <SectionCard title="Excel workbook">
                <DownloadPanel
                  filename={`${exportFilename}.xlsx`}
                  detail={`${pluralVars(vars.length)} from ${scopeLabel}`}
                  busy={xlsxExporting}
                  onDownload={handleXlsxDownload}
                />
              </SectionCard>
            ) : (
              <OutputBlock
                title={`${active.label} preview`}
                description={pluralVars(vars.length)}
                value={output}
                downloadName={`${exportFilename}.${active.ext}`}
                downloadMime={active.mime}
              />
            )}
          </>
        )}

        {!def && !defLoading && !defError && selectedDefId === null && (
          <EmptyState
            icon={Download}
            title="Choose a pipeline to export"
            description="A preview of the file appears here before you download it."
          />
        )}
      </PageLayout>
    </RequireProject>
  );
}
