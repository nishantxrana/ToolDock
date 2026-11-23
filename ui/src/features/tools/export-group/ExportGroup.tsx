import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { DownloadPanel } from '@/components/common/DownloadPanel';
import { pluralVars } from '@/lib/utils/variables';
import { PageLayout } from '@/components/common/PageLayout';
import { SectionCard } from '@/components/common/SectionCard';
import { OutputBlock } from '@/components/common/OutputBlock';
import { EmptyState } from '@/components/common/EmptyState';
import { VariableGroupPicker } from '@/components/common/VariableGroupPicker';
import { RequireProject } from '@/components/common/RequireProject';
import { FormatToggle } from '@/components/common/FormatToggle';
import { Callout } from '@/components/common/Callout';
import { toKeyValueCsv, toKeyValueTxt } from '@/lib/utils/csv';
import { safeFilename } from '@/lib/utils/download';
import { exportKeyValueXlsx } from '@/lib/utils/xlsx';
import { variableCount, variableEntries } from '@/lib/utils/variables';
import { useSessionStore } from '@/store/sessionStore';
import { toast } from 'sonner';
import type { VariableGroup } from '@/types/ado';

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

/** Text formats only - xlsx is binary and built separately. */
function buildOutput(group: VariableGroup, format: Exclude<Format, 'xlsx'>): string {
  const entries = variableEntries(group);
  if (format === 'csv') {
    return toKeyValueCsv(
      entries.map((e) => ({ key: e.key, value: e.value ?? '', isSecret: e.isSecret })),
    );
  }
  if (format === 'txt') {
    return toKeyValueTxt(
      entries.map((e) => ({ key: e.key, value: e.value ?? '', isSecret: e.isSecret })),
    );
  }
  // JSON - Azure DevOps compatible `variables` structure.
  const variables: Record<string, { value: string; isSecret?: boolean }> = {};
  for (const e of entries) {
    variables[e.key] = e.isSecret ? { value: '', isSecret: true } : { value: e.value ?? '' };
  }
  return JSON.stringify({ name: group.name, type: group.type, variables }, null, 2);
}

/** Tool 4 - export a variable group as CSV / JSON / TXT / XLSX. */
export function ExportGroup() {
  const organization = useSessionStore((s) => s.organization);
  const [group, setGroup] = useState<VariableGroup | null>(null);
  const [format, setFormat] = useState<Format>('csv');
  const [xlsxExporting, setXlsxExporting] = useState(false);

  const output = useMemo(
    () => (group && format !== 'xlsx' ? buildOutput(group, format) : ''),
    [group, format],
  );
  const active = FORMATS.find((f) => f.id === format)!;
  const hasSecrets = useMemo(
    () => (group ? variableEntries(group).some((e) => e.isSecret) : false),
    [group],
  );

  const exportFilename = group
    ? safeFilename(organization ? `${organization}-${group.name}` : group.name)
    : '';

  const handleXlsxDownload = async () => {
    if (!group) return;
    setXlsxExporting(true);
    try {
      const entries = variableEntries(group);
      await exportKeyValueXlsx(
        `${exportFilename}.xlsx`,
        group.name,
        entries.map((e) => ({ key: e.key, value: e.value ?? '', isSecret: e.isSecret })),
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
        title="Export Variable Group"
        description="Download one variable group as CSV, JSON, TXT or an Excel workbook. JSON uses the same shape as the Azure DevOps API."
        icon={Download}
      >
        <SectionCard
          title="Variable group"
          actions={<FormatToggle formats={FORMATS} value={format} onChange={setFormat} />}
        >
          <VariableGroupPicker value={group?.id ?? null} onChange={(_, g) => setGroup(g)} />
        </SectionCard>

        {group ? (
          <>
            {hasSecrets && (
              <Callout variant="info">
                Secret values can’t be read from Azure DevOps. They’re exported as secret with no
                value, so they can’t be mistaken for empty ones.
              </Callout>
            )}
            {format === 'xlsx' ? (
              <SectionCard title="Excel workbook">
                <DownloadPanel
                  filename={`${exportFilename}.xlsx`}
                  detail={`One sheet named "${group.name}" with ${pluralVars(variableCount(group))}`}
                  busy={xlsxExporting}
                  onDownload={handleXlsxDownload}
                />
              </SectionCard>
            ) : (
              <OutputBlock
                title={`${active.label} preview`}
                description={pluralVars(variableCount(group))}
                value={output}
                downloadName={`${exportFilename}.${active.ext}`}
                downloadMime={active.mime}
              />
            )}
          </>
        ) : (
          <EmptyState
            icon={Download}
            title="Choose a group to export"
            description="A preview of the file appears here before you download it."
          />
        )}
      </PageLayout>
    </RequireProject>
  );
}
