import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Loader2, Play, Vault } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/common/Callout';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import {
  addVariablesToGroup,
  createVariableGroup,
  listVariableGroups,
} from '@/lib/api/variableGroups';
import { isKeyVaultGroup, nameTaken, planGroupCopy, type SecretMode } from '@/lib/utils/groupCopy';
import { adoLinks } from '@/lib/migration/links';
import type { ReportItem } from '@/lib/migration/report';
import { useMigrationStore, type AdoConnection } from '@/store/migrationStore';
import type { VariableGroup } from '@/types/ado';
import { MIGRATIONS } from '../registry';
import { ConnectionsStep } from '../components/ConnectionCard';
import { MigrationShell, StepTitle } from '../components/MigrationShell';
import { prepareJob, sideLabels, useConnectionsReady, useJobParam } from '../components/jobs';
import { PickList, type PickRow } from '../components/PickList';
import { ChoiceGroup, ToggleRow } from '../components/Options';
import { ReviewPanel, StepNav } from '../components/Wizard';
import { RunPanel } from '../components/RunPanel';
import { ReportView } from '../components/ReportView';
import { useMigrationRun, type MigTask, type RunApi } from '../useMigrationRun';
import { freeName } from './names';

const DEF = MIGRATIONS.find((m) => m.id === 'variable-groups')!;
const STEPS = [
  { id: 'connect', label: 'Connect' },
  { id: 'select', label: 'Choose groups' },
  { id: 'options', label: 'Options' },
  { id: 'review', label: 'Review' },
  { id: 'run', label: 'Migrate' },
  { id: 'report', label: 'Report' },
];

type Clash = 'skip' | 'merge' | 'suffix';

interface Settings {
  selected: string[];
  clash: Clash;
  secretMode: SecretMode;
  copyDescription: boolean;
}

const secretCount = (g: VariableGroup) =>
  Object.values(g.variables ?? {}).filter((v) => v.isSecret).length;

function useGroups(conn: AdoConnection | null, side: 'source' | 'target') {
  return useQuery({
    queryKey: ['mig', side, conn?.organization, conn?.project?.id, 'variableGroups'],
    enabled: Boolean(conn?.project),
    queryFn: ({ signal }) =>
      listVariableGroups(conn!.organization, conn!.project!.name, signal, conn!),
  });
}

/** Report items known before the run: secrets to fill and Key Vault groups. */
function predict(
  groups: VariableGroup[],
  selected: Set<string>,
  s: Settings,
  target: AdoConnection,
): ReportItem[] {
  const items: ReportItem[] = [];
  const org = target.organization;
  const proj = target.project!.name;
  for (const g of groups) {
    if (isKeyVaultGroup(g)) {
      items.push({
        area: 'Variable groups',
        severity: 'action',
        title: 'Recreate Key Vault-linked group',
        detail: `"${g.name}" gets its values from Azure Key Vault, so it won't be migrated. Create it in the target and link it to the vault (needs an Azure Resource Manager service connection).`,
        targetUrl: adoLinks.library(org, proj),
      });
      continue;
    }
    if (!selected.has(String(g.id))) continue;
    const n = secretCount(g);
    if (n > 0) {
      items.push({
        area: 'Variable groups',
        severity: s.secretMode === 'placeholder' ? 'action' : 'info',
        title: s.secretMode === 'placeholder' ? 'Fill secret values' : 'Secrets left out',
        detail:
          s.secretMode === 'placeholder'
            ? `"${g.name}" has ${n} secret${n === 1 ? '' : 's'}, created empty for you to fill.`
            : `"${g.name}" has ${n} secret${n === 1 ? '' : 's'}, which won't be created.`,
        targetUrl: adoLinks.library(org, proj),
      });
    }
  }
  items.push({
    area: 'Variable groups',
    severity: 'info',
    title: 'Permissions and pipeline access',
    detail:
      'Group security and "Pipeline permissions" aren\'t copied. Pipelines that use a group will ask for access on their first run.',
  });
  return items;
}

export default function VariableGroupsMigration() {
  const resumeJob = useJobParam();
  const source = useMigrationStore((s) => (s.source?.kind === 'ado' ? s.source : null));
  const target = useMigrationStore((s) => s.target);
  const ready = useConnectionsReady('ado');
  const run = useMigrationRun();

  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clash, setClash] = useState<Clash>('skip');
  const [secretMode, setSecretMode] = useState<SecretMode>('placeholder');
  const [copyDescription, setCopyDescription] = useState(true);
  const [ack, setAck] = useState(false);

  const src = useGroups(source, 'source');
  const tgt = useGroups(target, 'target');
  const groups = useMemo(() => src.data ?? [], [src.data]);
  const settings: Settings = { selected: [...selected], clash, secretMode, copyDescription };

  // Resuming: restore choices, or open a finished job's report.
  useEffect(() => {
    if (!resumeJob) return;
    const s = resumeJob.settings as unknown as Settings;
    setSelected(new Set(s.selected ?? []));
    setClash(s.clash ?? 'skip');
    setSecretMode(s.secretMode ?? 'placeholder');
    setCopyDescription(s.copyDescription ?? true);
    if (resumeJob.status === 'done') {
      void run.load(resumeJob).then(() => setStep(5));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeJob]);

  const rows: PickRow[] = groups.map((g) => {
    const kv = isKeyVaultGroup(g);
    const n = Object.keys(g.variables ?? {}).length;
    const secrets = secretCount(g);
    const clashes = tgt.data ? nameTaken(g.name, tgt.data) : false;
    return {
      id: String(g.id),
      label: g.name,
      search: g.description,
      detail: kv
        ? 'Linked to Azure Key Vault'
        : `${n} variable${n === 1 ? '' : 's'}${g.description ? ` · ${g.description}` : ''}`,
      disabledReason: kv
        ? "Linked to Azure Key Vault, so it can't be migrated: its values live in the vault. Recreate it in the target and link it to the vault. It's listed in the final report."
        : undefined,
      badges: (
        <>
          {kv && (
            <Badge variant="secondary">
              <Vault className="h-3 w-3" />
              Key Vault
            </Badge>
          )}
          {secrets > 0 && (
            <Badge variant="warning">
              <KeyRound className="h-3 w-3" />
              {secrets} secret{secrets === 1 ? '' : 's'}
            </Badge>
          )}
          {clashes && !kv && <Badge variant="info">Name exists in target</Badge>}
        </>
      ),
    };
  });

  const chosen = groups.filter((g) => selected.has(String(g.id)) && !isKeyVaultGroup(g));
  const clashCount = chosen.filter((g) => tgt.data && nameTaken(g.name, tgt.data)).length;

  const start = async () => {
    if (!source || !target?.project) return;
    const job = await prepareJob(
      DEF,
      `Variable groups: ${source.project?.name} → ${target.project.name}`,
      { ...settings },
      // Reuse this run's job on "Retry failed", so finished items are skipped.
      run.job ?? resumeJob,
    );
    setStep(4);
    await run.execute(job, (api) => migrateGroups(api, chosen, groups, settings, source, target));
    setStep(5);
  };

  const labels = sideLabels();

  return (
    <MigrationShell
      def={DEF}
      steps={STEPS}
      step={step}
      onStep={setStep}
      locked={run.state === 'running' || run.state === 'paused'}
    >
      {step === 0 && (
        <>
          <StepTitle
            title="Connect both sides"
            description="Groups are read from the source and created in the target. Use the same organization on both sides to copy between projects."
          />
          {resumeJob && resumeJob.status !== 'done' && (
            <Callout variant="info" title="Resuming an earlier migration" className="mb-4">
              Reconnect to the same source and target. Groups already copied will be skipped.
            </Callout>
          )}
          <ConnectionsStep sourceKind="ado" scopes={DEF.scopes} />
          <StepNav
            onNext={() => setStep(1)}
            nextDisabled={!ready}
            hint={!ready ? 'Connect both sides and choose a project on each.' : undefined}
          />
        </>
      )}

      {step === 1 && (
        <>
          <StepTitle
            title="Choose groups"
            description="Key Vault-linked groups are listed but can't be migrated."
          />
          {src.isError && <ErrorBanner error={src.error} onRetry={() => src.refetch()} />}
          {src.isLoading ? (
            <p className="flex items-center gap-2 text-13 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading variable groups…
            </p>
          ) : (
            <PickList
              rows={rows}
              selected={selected}
              onChange={setSelected}
              noun="group"
              emptyText="The source project has no variable groups."
            />
          )}
          <StepNav
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
            nextDisabled={chosen.length === 0}
          />
        </>
      )}

      {step === 2 && (
        <>
          <StepTitle title="Options" />
          <div className="space-y-5">
            <ChoiceGroup<Clash>
              label="When a group with the same name already exists in the target"
              hint={
                clashCount > 0
                  ? `${clashCount} of the chosen groups already exist in the target.`
                  : 'None of the chosen groups exist in the target yet.'
              }
              value={clash}
              onChange={setClash}
              choices={[
                { value: 'skip', label: 'Skip it', detail: 'Leave the existing group alone.' },
                {
                  value: 'merge',
                  label: 'Add missing keys',
                  detail: 'Add keys the target group lacks. Existing values never change.',
                },
                {
                  value: 'suffix',
                  label: 'Create a copy',
                  detail: 'Create "<name>-migrated" next to it.',
                },
              ]}
            />
            <ChoiceGroup<SecretMode>
              label="Secret variables"
              hint="Azure DevOps never returns secret values, so they can't be copied."
              value={secretMode}
              onChange={setSecretMode}
              choices={[
                {
                  value: 'placeholder',
                  label: 'Create them empty',
                  detail: 'Each one is listed in the report with a link, to fill in.',
                },
                {
                  value: 'skip',
                  label: 'Leave them out',
                  detail: 'Only plain variables are created.',
                },
              ]}
            />
            <ToggleRow
              label="Copy descriptions"
              checked={copyDescription}
              onChange={setCopyDescription}
            />
          </div>
          <StepNav onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </>
      )}

      {step === 3 && target && (
        <>
          <StepTitle title="Review" />
          <ReviewPanel
            summary={
              <p>
                Copy <strong>{chosen.length}</strong> group{chosen.length === 1 ? '' : 's'} from{' '}
                <strong>{labels.source}</strong> to <strong>{labels.target}</strong>.{' '}
                {clashCount > 0 &&
                  `${clashCount} already exist${clashCount === 1 ? 's' : ''} there and will be ${
                    clash === 'skip'
                      ? 'skipped'
                      : clash === 'merge'
                        ? 'given any missing keys'
                        : 'copied under a new name'
                  }.`}
              </p>
            }
            predicted={predict(groups, selected, settings, target)}
            acknowledged={ack}
            onAcknowledge={setAck}
          />
          <StepNav
            onBack={() => setStep(2)}
            next={
              <Button size="sm" onClick={() => void start()} disabled={!ack || chosen.length === 0}>
                <Play />
                Start migration
              </Button>
            }
          />
        </>
      )}

      {step === 4 && (
        <>
          <StepTitle
            title="Migrating"
            description="Keep this tab open. You can pause or stop at any time."
          />
          <RunPanel run={run} />
        </>
      )}

      {step === 5 && (
        <>
          <StepTitle title="Migration report" />
          <ReportView
            title="Variable groups migration"
            source={labels.source}
            target={labels.target}
            counts={run.counts}
            items={run.report}
            failures={run.failures}
            cancelled={run.state === 'cancelled'}
            onRetry={ready ? () => void start() : undefined}
          />
        </>
      )}
    </MigrationShell>
  );
}

/** The run itself: one task per group. */
async function migrateGroups(
  api: RunApi,
  chosen: VariableGroup[],
  all: VariableGroup[],
  s: Settings,
  source: AdoConnection,
  target: AdoConnection,
) {
  const tProject = target.project!;
  // Fresh list right before writing, so clashes created meanwhile are caught.
  const existing = await listVariableGroups(target.organization, tProject.name, api.signal, target);

  // Key Vault groups are never migrated; say so in the report.
  for (const g of all.filter(isKeyVaultGroup)) {
    api.report({
      area: 'Variable groups',
      severity: 'action',
      title: 'Recreate Key Vault-linked group',
      detail: `"${g.name}" gets its values from Azure Key Vault and wasn't migrated. Create it in the target and link it to the vault.`,
      targetUrl: adoLinks.library(target.organization, tProject.name),
    });
  }

  const tasks: MigTask[] = chosen.map((g) => ({
    key: `group:${g.id}`,
    label: g.name,
    journal: { kind: 'group', sourceId: String(g.id) },
    run: async () => {
      // Lists don't always carry every variable; read the group itself.
      const full = g;
      const plan = planGroupCopy(full, s.secretMode);
      const secretItems = (groupId: number, groupName: string, keys: string[]) =>
        keys.map<ReportItem>((key) => ({
          area: 'Variable groups',
          severity: s.secretMode === 'placeholder' ? 'action' : 'info',
          title: s.secretMode === 'placeholder' ? 'Fill secret value' : 'Secret left out',
          detail: `${key} in "${groupName}"`,
          targetUrl: adoLinks.variableGroup(target.organization, tProject.name, groupId),
          sourceUrl: adoLinks.variableGroup(source.organization, source.project!.name, g.id),
        }));

      const match = existing.find((e) => e.name.toLowerCase() === g.name.toLowerCase());
      if (match && s.clash === 'skip') {
        return {
          status: 'skipped',
          message: 'A group with this name already exists in the target.',
          targetId: String(match.id),
        };
      }
      if (match && s.clash === 'merge') {
        if (isKeyVaultGroup(match)) {
          return {
            status: 'skipped',
            message:
              "The target group with this name is linked to Key Vault, so keys can't be added.",
          };
        }
        const { added, skipped } = await addVariablesToGroup(
          target.organization,
          tProject.name,
          match.id,
          plan.variables,
          target,
        );
        api.report(
          secretItems(
            match.id,
            match.name,
            plan.secrets.filter((k) => added.includes(k)),
          ),
        );
        return {
          status: added.length > 0 ? 'ok' : 'skipped',
          message: `${added.length} key${added.length === 1 ? '' : 's'} added${skipped.length ? `, ${skipped.length} already there` : ''}.`,
          targetId: String(match.id),
        };
      }

      const name = match ? freeName(g.name, existing) : g.name;
      const created = await createVariableGroup(
        target.organization,
        {
          name,
          description: s.copyDescription ? (g.description ?? '') : '',
          type: 'Vsts',
          variables: plan.variables,
          variableGroupProjectReferences: [
            {
              name,
              description: s.copyDescription ? (g.description ?? '') : '',
              projectReference: { id: tProject.id, name: tProject.name },
            },
          ],
        },
        target,
      );
      existing.push(created);
      api.report(secretItems(created.id, created.name, plan.secrets));
      return {
        status: plan.secrets.length > 0 && s.secretMode === 'placeholder' ? 'warning' : 'ok',
        message: [
          `${plan.copiedCount} variable${plan.copiedCount === 1 ? '' : 's'}`,
          name !== g.name ? `created as "${name}"` : '',
          plan.secrets.length
            ? `${plan.secrets.length} secret${plan.secrets.length === 1 ? '' : 's'} to fill`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
        targetId: String(created.id),
      };
    },
  }));

  await api.phase('Creating variable groups', tasks);
  api.report({
    area: 'Variable groups',
    severity: 'info',
    title: 'Permissions and pipeline access',
    detail:
      'Group security and "Pipeline permissions" aren\x27t copied. Pipelines that use a group will ask for access on their first run.',
  });
  api.report({
    area: 'General',
    severity: 'action',
    title: 'Revoke both tokens',
    detail: 'When you have finished, revoke the source and target tokens (or let them expire).',
    targetUrl: adoLinks.tokens(target.organization),
  });
}
