import { useMemo, useState } from 'react';
import { FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { Callout } from '@/components/common/Callout';
import { toast } from 'sonner';
import { PageLayout } from '@/components/common/PageLayout';
import { SectionCard } from '@/components/common/SectionCard';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { VariableGroupPicker } from '@/components/common/VariableGroupPicker';
import { RequireProject } from '@/components/common/RequireProject';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CsvDropzone } from './CsvDropzone';
import { ImportPreviewTable, ImportPreviewTableWithControls } from './ImportPreviewTable';
import { buildImportPlan } from './importDiff';
import { parseKeyValueCsv } from '@/lib/utils/csv';
import { useUpdateVariableGroup } from '@/lib/hooks/useUpdateVariableGroup';
import { AdoError, errorMessage, errorTitle } from '@/lib/api/errors';
import { useSessionStore } from '@/store/sessionStore';
import type { VariableGroup } from '@/types/ado';

/**
 * Tool 3 - import variables from a CSV into a variable group. Shows a full
 * per-key diff and requires explicit confirmation before writing. Existing
 * variables not present in the CSV are preserved.
 */
export function CsvImport() {
  const [group, setGroup] = useState<VariableGroup | null>(null);
  const [csvText, setCsvText] = useState('');
  const [csvName, setCsvName] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useUpdateVariableGroup();
  const writable = useSessionStore((s) => s.variableGroupsWritable);
  const writeDenied = writable === false;

  const parsed = useMemo(() => (csvText ? parseKeyValueCsv(csvText) : null), [csvText]);
  const plan = useMemo(
    () => (group && parsed ? buildImportPlan(group, parsed.rows) : null),
    [group, parsed],
  );

  const reset = () => {
    setCsvText('');
    setCsvName('');
    mutation.reset();
  };

  const runImport = () => {
    if (!group || !plan) return;
    mutation.mutate(
      { groupId: group.id, nextVariables: plan.nextVariables },
      {
        onSuccess: (updated) => {
          setConfirmOpen(false);
          setGroup(updated);
          reset();
          // Report only the changes, not the total CSV row count.
          const parts = [
            plan.counts.new > 0 && `${plan.counts.new} added`,
            plan.counts.overwrite > 0 && `${plan.counts.overwrite} updated`,
          ].filter(Boolean);
          toast.success(
            `Imported into "${updated.name}" - ${parts.length > 0 ? parts.join(', ') : 'no changes'}`,
          );
        },
        onError: (err) => {
          setConfirmOpen(false);
          const scopeDenied =
            err instanceof AdoError && (err.kind === 'unauthorized' || err.kind === 'forbidden');
          toast.error(scopeDenied ? 'Insufficient PAT scope' : errorTitle(err), {
            description: errorMessage(err),
          });
        },
      },
    );
  };

  // Only changed rows shown in the confirm dialog - same rows are noise there.
  const dialogRows = useMemo(
    () => (plan ? plan.rows.filter((r) => r.status !== 'same') : []),
    [plan],
  );

  return (
    <RequireProject>
      <PageLayout
        title="CSV Import"
        description="Load Key,Value rows from a CSV into a variable group. You see every change, and confirm it, before anything is written to Azure DevOps."
        icon={FileSpreadsheet}
        actions={
          (csvText || group) && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw />
              Reset
            </Button>
          )
        }
      >
        <SectionCard title="Import into">
          <VariableGroupPicker value={group?.id ?? null} onChange={(_, g) => setGroup(g)} />
        </SectionCard>

        <SectionCard title="From CSV">
          {csvText ? (
            <div className="flex items-center justify-between gap-3 rounded-md border bg-popover py-2 pl-3 pr-2">
              <span className="min-w-0 truncate font-mono text-13 font-medium">
                {csvName || 'pasted.csv'}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {parsed?.rows.length ?? 0} row{parsed?.rows.length === 1 ? '' : 's'}
                </span>
                <Button variant="outline" size="sm" onClick={reset}>
                  Use a different file
                </Button>
              </div>
            </div>
          ) : (
            <CsvDropzone
              onFile={(text, name) => {
                setCsvText(text);
                setCsvName(name);
              }}
            />
          )}
        </SectionCard>

        {parsed && parsed.warnings.length > 0 && (
          <Callout variant="warning" title="Some rows were skipped">
            <div>
              <ul className="list-inside list-disc space-y-0.5">
                {parsed.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </Callout>
        )}

        {mutation.isError && <ErrorBanner error={mutation.error} />}

        {group && plan ? (
          plan.rows.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="No rows to import"
              description="The CSV has no usable Key,Value rows. Check that it has two columns separated by commas."
            />
          ) : (
            <SectionCard
              title="Review changes"
              description={`${plan.counts.new} new, ${plan.counts.overwrite} overwritten, ${plan.counts.same} unchanged. Variables not in the CSV are kept.`}
              actions={
                <div className="flex items-center gap-2">
                  {writeDenied ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0}>
                          <Button size="sm" disabled>
                            <Upload />
                            Import changes
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Your PAT can read but not write variable groups. Reconnect with a PAT that
                        has the "Variable Groups (Read, create, &amp; manage)" scope to import.
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Button size="sm" onClick={() => setConfirmOpen(true)}>
                      <Upload />
                      Import changes
                    </Button>
                  )}
                </div>
              }
            >
              {writeDenied && (
                <Callout variant="warning" className="mb-3">
                  Your token can read this group but not change it, so importing is turned off.
                  Reconnect with a token that has the Variable Groups{' '}
                  <strong>Read, create, &amp; manage</strong> scope to import.
                </Callout>
              )}
              <ImportPreviewTableWithControls rows={plan.rows} />
            </SectionCard>
          )
        ) : (
          <EmptyState
            icon={FileSpreadsheet}
            title="Choose a group and a CSV"
            description="The full list of changes appears here for you to review. Nothing is written until you confirm."
          />
        )}
      </PageLayout>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Import into ${group?.name}?`}
        description="This writes to Azure DevOps. ToolDock can’t undo it, so check the overwritten values first."
        confirmLabel={`Import ${(plan?.counts.new ?? 0) + (plan?.counts.overwrite ?? 0)} changes`}
        destructive={(plan?.counts.overwrite ?? 0) > 0}
        confirmDisabled={mutation.isPending}
        confirmLoading={mutation.isPending}
        onConfirm={runImport}
      >
        {plan && (
          <div className="min-w-0 space-y-3">
            {plan.counts.overwrite > 0 && (
              <Callout variant="warning">
                <strong>{plan.counts.overwrite}</strong> existing variable
                {plan.counts.overwrite === 1 ? '' : 's'} will be overwritten.
              </Callout>
            )}
            {/* Only show changed rows in the dialog - same rows add noise here. */}
            {dialogRows.length > 0 && <ImportPreviewTable rows={dialogRows} />}
          </div>
        )}
      </ConfirmDialog>
    </RequireProject>
  );
}
