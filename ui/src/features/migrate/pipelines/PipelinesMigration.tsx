import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Play, Puzzle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/common/Callout';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { ProgressBar } from '@/components/common/ProgressBar';
import {
  createBuildDefinition,
  createEnvironment,
  createReleaseDefinition,
  createTaskGroup,
  getAuthenticatedUserId,
  getBuildDefinition,
  getReleaseDefinitionJson,
  listBuildDefinitions,
  listDeploymentGroups,
  listEnvironments,
  listQueues,
  listReleaseDefinitionsFor,
  listTaskGroups,
  listTasks,
  type Json,
  type TaskDefinition,
} from '@/lib/api/migrate/pipelines';
import { getFileText, listRepos, type GitRepo } from '@/lib/api/migrate/git';
import { listEndpoints } from '@/lib/api/migrate/serviceEndpoints';
import { listProjectMembers } from '@/lib/api/migrate/wit';
import { createVariableGroup, listVariableGroups } from '@/lib/api/variableGroups';
import { AdoError, errorMessage } from '@/lib/api/errors';
import { planGroupCopy, isKeyVaultGroup } from '@/lib/utils/groupCopy';
import { adoLinks, marketplaceLink } from '@/lib/migration/links';
import type { ReportItem } from '@/lib/migration/report';
import {
  rewriteBuildDefinition,
  rewriteReleaseDefinition,
  rewriteTaskGroup,
  type IdMaps,
  type RewriteNote,
} from '@/lib/migration/pipelines/rewrite';
import {
  emptyDeps,
  orderTaskGroups,
  scanBuild,
  scanRelease,
  scanTaskGroup,
  yamlEnvironments,
  type PipelineDeps,
} from '@/lib/migration/pipelines/scan';
import { useMigrationStore, type AdoConnection } from '@/store/migrationStore';
import type { VariableGroup } from '@/types/ado';
import { MIGRATIONS } from '../registry';
import { ConnectionsStep } from '../components/ConnectionCard';
import { MigrationShell, StepTitle } from '../components/MigrationShell';
import { prepareJob, sideLabels, useConnectionsReady, useJobParam } from '../components/jobs';
import { PickList, type PickRow } from '../components/PickList';
import { ChoiceGroup, ToggleRow } from '../components/Options';
import { MapTable, UNMAPPED, type MapRow } from '../components/MapTable';
import { autoMatch } from '../components/mapMatch';
import { ReviewPanel, StepNav } from '../components/Wizard';
import { RunPanel } from '../components/RunPanel';
import { ReportView } from '../components/ReportView';
import { useMigrationRun, type MigTask, type RunApi } from '../useMigrationRun';

const DEF = MIGRATIONS.find((m) => m.id === 'pipelines')!;
const STEPS = [
  { id: 'connect', label: 'Connect' },
  { id: 'select', label: 'Choose pipelines' },
  { id: 'map', label: 'Map resources' },
  { id: 'review', label: 'Review' },
  { id: 'run', label: 'Migrate' },
  { id: 'report', label: 'Report' },
];
const CREATE = '__create__';

interface Analysis {
  builds: Json[];
  releases: Json[];
  taskGroups: Json[];
  deps: PipelineDeps;
  source: {
    queues: { id: number; name: string }[];
    endpoints: { id: string; name: string; type: string }[];
    groups: VariableGroup[];
    deploymentGroups: { id: number; name: string }[];
    tasks: TaskDefinition[];
    builds: { id: number; name: string }[];
  };
  target: {
    queues: { id: number; name: string }[];
    endpoints: { id: string; name: string; type: string }[];
    groups: VariableGroup[];
    deploymentGroups: { id: number; name: string }[];
    repos: GitRepo[];
    taskGroups: Json[];
    builds: { id: number; name: string; path?: string }[];
    releases: { id: number; name: string }[];
    environments: { id: number; name: string }[];
    taskIds: Set<string> | null;
  };
}

type Mapping = Record<
  'queues' | 'endpoints' | 'groups' | 'repos' | 'deploymentGroups' | 'builds',
  Record<string, string>
>;

interface Settings {
  builds: number[];
  releases: number[];
  missingTaskMode: 'block' | 'disable';
  clash: 'skip' | 'suffix';
  mapApprovers: boolean;
  mapping: Mapping;
}

const emptyMapping = (): Mapping => ({
  queues: {},
  endpoints: {},
  groups: {},
  repos: {},
  deploymentGroups: {},
  builds: {},
});

async function analyse(
  source: AdoConnection,
  target: AdoConnection,
  buildIds: number[],
  releaseIds: number[],
  onProgress: (label: string, pct: number) => void,
): Promise<Analysis> {
  const sp = source.project!.name;
  const tp = target.project!.name;
  onProgress('Reading pipeline definitions', 5);
  const builds: Json[] = [];
  for (const [i, id] of buildIds.entries()) {
    builds.push(await getBuildDefinition(source, sp, id));
    onProgress(
      'Reading pipeline definitions',
      5 + (40 * (i + 1)) / Math.max(1, buildIds.length + releaseIds.length),
    );
  }
  const releases: Json[] = [];
  for (const [i, id] of releaseIds.entries()) {
    releases.push(await getReleaseDefinitionJson(source, sp, id));
    onProgress(
      'Reading pipeline definitions',
      5 + (40 * (buildIds.length + i + 1)) / Math.max(1, buildIds.length + releaseIds.length),
    );
  }

  onProgress('Reading resources on both sides', 50);
  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch {
      return fallback;
    }
  };
  const [
    sQueues,
    sEndpoints,
    sGroups,
    sDg,
    sTaskGroups,
    sTasks,
    sBuilds,
    tQueues,
    tEndpoints,
    tGroups,
    tDg,
    tRepos,
    tTaskGroups,
    tBuilds,
    tReleases,
    tEnvs,
    tTasks,
  ] = await Promise.all([
    safe(listQueues(source, sp), []),
    safe(listEndpoints(source, sp), []),
    safe(listVariableGroups(source.organization, sp, undefined, source), []),
    safe(listDeploymentGroups(source, sp), []),
    safe(listTaskGroups(source, sp), []),
    safe(listTasks(source), []),
    safe(listBuildDefinitions(source, sp), []),
    listQueues(target, tp),
    safe(listEndpoints(target, tp), []),
    safe(listVariableGroups(target.organization, tp, undefined, target), []),
    safe(listDeploymentGroups(target, tp), []),
    listRepos(target, tp),
    safe(listTaskGroups(target, tp), []),
    listBuildDefinitions(target, tp),
    safe(listReleaseDefinitionsFor(target, tp), []),
    safe(listEnvironments(target, tp), []),
    listTasks(target)
      .then((t) => new Set(t.map((x) => x.id.toLowerCase())))
      .catch(() => null),
  ]);
  onProgress('Working out dependencies', 90);

  const deps = emptyDeps();
  builds.forEach((b) => scanBuild(b, deps));
  releases.forEach((r) => scanRelease(r, deps));
  // Task groups used, including nested ones; latest non-deleted version of each.
  const latest = new Map<string, Json>();
  for (const g of sTaskGroups) {
    if (g.deleted) continue;
    const id = String(g.id).toLowerCase();
    const cur = latest.get(id);
    const major = Number((g.version as Json | undefined)?.major ?? 0);
    if (!cur || major > Number((cur.version as Json | undefined)?.major ?? 0)) latest.set(id, g);
  }
  const used: Json[] = [];
  const seen = new Set<string>();
  const queue = [...deps.taskGroups];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const g = latest.get(id);
    if (!g) continue;
    used.push(g);
    const before = new Set(deps.taskGroups);
    scanTaskGroup(g, deps);
    for (const n of deps.taskGroups) if (!before.has(n)) queue.push(n);
  }
  // Release stage queue ids get proper names from the source queue list.
  for (const [id] of deps.queues) {
    const q = sQueues.find((x) => x.id === id);
    if (q) deps.queues.set(id, q.name);
  }
  onProgress('Done', 100);

  return {
    builds,
    releases,
    taskGroups: orderTaskGroups(used),
    deps,
    source: {
      queues: sQueues,
      endpoints: sEndpoints,
      groups: sGroups,
      deploymentGroups: sDg,
      tasks: sTasks,
      builds: sBuilds,
    },
    target: {
      queues: tQueues,
      endpoints: tEndpoints,
      groups: tGroups,
      deploymentGroups: tDg,
      repos: tRepos,
      taskGroups: tTaskGroups,
      builds: tBuilds,
      releases: tReleases,
      environments: tEnvs,
      taskIds: tTasks,
    },
  };
}

/** Rows for each mapping table, from what the selection actually uses. */
function mapRows(a: Analysis) {
  const endpointIds = new Set(a.source.endpoints.map((e) => e.id.toLowerCase()));
  const selectedBuildIds = new Set(a.builds.map((b) => Number(b.id)));
  return {
    queues: [...a.deps.queues].map<MapRow>(([id, name]) => ({ key: String(id), label: name })),
    endpoints: a.source.endpoints
      .filter((e) => a.deps.guids.has(e.id.toLowerCase()) && endpointIds.has(e.id.toLowerCase()))
      .map<MapRow>((e) => ({ key: e.id.toLowerCase(), label: e.name, detail: e.type })),
    groups: [...a.deps.variableGroups].map<MapRow>((id) => {
      const g = a.source.groups.find((x) => x.id === id);
      return {
        key: String(id),
        label: g?.name ?? `Group ${id}`,
        detail: g ? `${Object.keys(g.variables ?? {}).length} variables` : 'Not found in source',
      };
    }),
    repos: [...a.deps.repos].map<MapRow>(([id, name]) => ({ key: id, label: name })),
    deploymentGroups: [...a.deps.deploymentGroups].map<MapRow>((id) => ({
      key: String(id),
      label: a.source.deploymentGroups.find((d) => d.id === id)?.name ?? `Deployment group ${id}`,
    })),
    builds: [...a.deps.buildDefinitions]
      .filter((id) => !selectedBuildIds.has(id))
      .map<MapRow>((id) => ({
        key: String(id),
        label: a.source.builds.find((b) => b.id === id)?.name ?? `Pipeline ${id}`,
        detail: 'Used by a release, not selected',
      })),
  };
}

function initialMapping(a: Analysis): Mapping {
  const rows = mapRows(a);
  return {
    queues: autoMatch(
      rows.queues,
      a.target.queues.map((q) => ({ value: String(q.id), label: q.name })),
    ),
    endpoints: autoMatch(
      rows.endpoints,
      a.target.endpoints.map((e) => ({ value: e.id, label: e.name })),
    ),
    groups: autoMatch(
      rows.groups,
      a.target.groups.map((g) => ({ value: String(g.id), label: g.name })),
      CREATE,
    ),
    repos: autoMatch(
      rows.repos,
      a.target.repos.map((r) => ({ value: r.id, label: r.name })),
    ),
    deploymentGroups: autoMatch(
      rows.deploymentGroups,
      a.target.deploymentGroups.map((d) => ({ value: String(d.id), label: d.name })),
    ),
    builds: autoMatch(
      rows.builds,
      a.target.builds.map((b) => ({ value: String(b.id), label: b.name })),
    ),
  };
}

/** Tasks used by the selection that the target doesn't have (from extensions not installed). */
function missingTasks(a: Analysis): TaskDefinition[] {
  if (!a.target.taskIds) return [];
  const out = new Map<string, TaskDefinition>();
  for (const id of a.deps.tasks) {
    if (a.target.taskIds.has(id)) continue;
    const def = a.source.tasks.find((t) => t.id.toLowerCase() === id);
    out.set(id, def ?? { id, name: id });
  }
  return [...out.values()];
}

export default function PipelinesMigration() {
  const resumeJob = useJobParam();
  const source = useMigrationStore((s) => (s.source?.kind === 'ado' ? s.source : null));
  const target = useMigrationStore((s) => s.target);
  const ready = useConnectionsReady('ado');
  const run = useMigrationRun();

  const [step, setStep] = useState(0);
  const [builds, setBuilds] = useState<Set<string>>(new Set());
  const [releases, setReleases] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysing, setAnalysing] = useState<{ label: string; pct: number } | null>(null);
  const [analysisError, setAnalysisError] = useState<unknown>(null);
  const [mapping, setMapping] = useState<Mapping>(emptyMapping());
  const [missingTaskMode, setMissingTaskMode] = useState<'block' | 'disable'>('block');
  const [clash, setClash] = useState<'skip' | 'suffix'>('skip');
  const [mapApprovers, setMapApprovers] = useState(false);
  const [ack, setAck] = useState(false);

  const sp = source?.project;
  const buildList = useQuery({
    queryKey: ['mig', 'source', source?.organization, sp?.id, 'builds'],
    enabled: Boolean(sp),
    queryFn: () => listBuildDefinitions(source!, sp!.name),
  });
  const releaseList = useQuery({
    queryKey: ['mig', 'source', source?.organization, sp?.id, 'releases'],
    enabled: Boolean(sp),
    queryFn: () => listReleaseDefinitionsFor(source!, sp!.name),
    retry: false,
  });

  useEffect(() => {
    if (!resumeJob) return;
    const s = resumeJob.settings as unknown as Settings;
    setBuilds(new Set((s.builds ?? []).map(String)));
    setReleases(new Set((s.releases ?? []).map(String)));
    setMissingTaskMode(s.missingTaskMode ?? 'block');
    setClash(s.clash ?? 'skip');
    setMapApprovers(s.mapApprovers ?? false);
    if (s.mapping) setMapping(s.mapping);
    if (resumeJob.status === 'done') void run.load(resumeJob).then(() => setStep(5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeJob]);

  const buildRows: PickRow[] = (buildList.data ?? []).map((b) => ({
    id: String(b.id),
    label: b.name,
    detail: b.path && b.path !== '\\' ? b.path : 'Root folder',
    search: b.path,
  }));
  const releaseRows: PickRow[] = (releaseList.data ?? []).map((r) => ({
    id: String(r.id),
    label: r.name,
    detail: r.path && r.path !== '\\' ? r.path : 'Root folder',
    search: r.path,
  }));

  const toMap = async () => {
    if (!source || !target) return;
    setAnalysisError(null);
    setAnalysing({ label: 'Starting', pct: 2 });
    try {
      const a = await analyse(
        source,
        target,
        [...builds].map(Number),
        [...releases].map(Number),
        (label, pct) => setAnalysing({ label, pct }),
      );
      setAnalysis(a);
      // Keep choices restored from a resumed job; fill anything new automatically.
      const auto = initialMapping(a);
      setMapping((m) => ({
        queues: { ...auto.queues, ...m.queues },
        endpoints: { ...auto.endpoints, ...m.endpoints },
        groups: { ...auto.groups, ...m.groups },
        repos: { ...auto.repos, ...m.repos },
        deploymentGroups: { ...auto.deploymentGroups, ...m.deploymentGroups },
        builds: { ...auto.builds, ...m.builds },
      }));
      setStep(2);
    } catch (e) {
      setAnalysisError(e);
    } finally {
      setAnalysing(null);
    }
  };

  const rows = useMemo(() => (analysis ? mapRows(analysis) : null), [analysis]);
  const missing = useMemo(() => (analysis ? missingTasks(analysis) : []), [analysis]);
  const set = (k: keyof Mapping) => (key: string, v: string) =>
    setMapping((m) => ({ ...m, [k]: { ...m[k], [key]: v } }));

  const unmappedRepos = rows
    ? rows.repos.filter((r) => (mapping.repos[r.key] ?? UNMAPPED) === UNMAPPED)
    : [];

  const predicted = (): ReportItem[] => {
    if (!analysis || !rows || !target?.project) return [];
    const org = target.organization;
    const proj = target.project.name;
    const items: ReportItem[] = [];
    for (const r of rows.endpoints.filter(
      (x) => (mapping.endpoints[x.key] ?? UNMAPPED) === UNMAPPED,
    )) {
      items.push({
        area: 'Pipelines',
        severity: 'action',
        title: 'Create service connection',
        detail: `"${r.label}" (${String(r.detail)}) has no match in the target. Steps that use it will have that input cleared.`,
        targetUrl: adoLinks.serviceConnections(org, proj),
      });
    }
    for (const r of rows.queues.filter((x) => (mapping.queues[x.key] ?? UNMAPPED) === UNMAPPED)) {
      items.push({
        area: 'Pipelines',
        severity: 'action',
        title: 'Choose an agent pool',
        detail: `Pool "${r.label}" has no match; affected pipelines and stages will need a pool set.`,
        targetUrl: adoLinks.agentQueues(org, proj),
      });
    }
    for (const r of rows.deploymentGroups.filter(
      (x) => (mapping.deploymentGroups[x.key] ?? UNMAPPED) === UNMAPPED,
    )) {
      items.push({
        area: 'Pipelines',
        severity: 'action',
        title: 'Create deployment group',
        detail: `"${r.label}" doesn't exist in the target. Create it and register its agents.`,
        targetUrl: adoLinks.deploymentGroups(org, proj),
      });
    }
    for (const t of missing) {
      items.push({
        area: 'Pipelines',
        severity: 'action',
        title: 'Install extension',
        detail: `Task "${t.friendlyName ?? t.name}" isn't installed in the target. ${missingTaskMode === 'block' ? 'Pipelines using it are skipped.' : 'Steps using it are created disabled.'}`,
        targetUrl: t.contributionIdentifier
          ? marketplaceLink(t.contributionIdentifier)
          : adoLinks.extensions(org),
      });
    }
    items.push(
      {
        area: 'Pipelines',
        severity: 'action',
        title: 'Service connection credentials',
        detail:
          "Connections can't be copied with their secrets. Make sure each one used by these pipelines exists in the target with working credentials.",
        targetUrl: adoLinks.serviceConnections(org, proj),
      },
      {
        area: 'Pipelines',
        severity: 'info',
        title: 'Run history not copied',
        detail: 'Builds, releases, logs, test results and retention leases stay in the source.',
      },
      {
        area: 'Pipelines',
        severity: 'info',
        title: 'Permissions and approvals',
        detail:
          'Pipeline security, environment approvals and checks are not copied. The first run asks to authorize resources.',
      },
    );
    return items;
  };

  const start = async () => {
    if (!source || !target?.project || !analysis) return;
    const settings: Settings = {
      builds: [...builds].map(Number),
      releases: [...releases].map(Number),
      missingTaskMode,
      clash,
      mapApprovers,
      mapping,
    };
    const job = await prepareJob(
      DEF,
      `Pipelines: ${source.project?.name} → ${target.project.name}`,
      { ...settings },
      // Reuse this run's job on "Retry failed", so finished items are skipped.
      run.job ?? resumeJob,
    );
    setStep(4);
    const upFront = predicted();
    await run.execute(job, (api) => {
      // What the Review step flagged belongs in the final report too.
      api.report(upFront);
      return migratePipelines(api, analysis, settings, source, target);
    });
    setStep(5);
  };

  const labels = sideLabels();
  const nothingChosen = builds.size + releases.size === 0;

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
            description="Copy repos first if the pipelines build code from them; the Map step matches repos by name."
          />
          {resumeJob && resumeJob.status !== 'done' && (
            <Callout variant="info" title="Resuming an earlier migration" className="mb-4">
              Reconnect to the same source and target. Pipelines already created will be skipped.
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
            title="Choose pipelines"
            description="Task groups the chosen pipelines use are included automatically."
          />
          <div className="space-y-6">
            <section className="space-y-2">
              <h3 className="text-13 font-semibold">Build pipelines (YAML and classic)</h3>
              {buildList.isError && (
                <ErrorBanner error={buildList.error} onRetry={() => buildList.refetch()} />
              )}
              {buildList.isLoading ? (
                <p className="flex items-center gap-2 text-13 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading build pipelines…
                </p>
              ) : (
                <PickList
                  rows={buildRows}
                  selected={builds}
                  onChange={setBuilds}
                  noun="pipeline"
                  emptyText="No build pipelines in the source project."
                />
              )}
            </section>
            <section className="space-y-2">
              <h3 className="text-13 font-semibold">Release pipelines (classic)</h3>
              {releaseList.isError ? (
                <Callout variant="info">
                  Release pipelines couldn't be read ({errorMessage(releaseList.error)}). The source
                  token needs Release (Read).
                </Callout>
              ) : releaseList.isLoading ? (
                <p className="flex items-center gap-2 text-13 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading release pipelines…
                </p>
              ) : (
                <PickList
                  rows={releaseRows}
                  selected={releases}
                  onChange={setReleases}
                  noun="release pipeline"
                  emptyText="No release pipelines in the source project."
                />
              )}
            </section>
          </div>
          {analysing && (
            <div className="mt-4 space-y-1.5">
              <ProgressBar value={analysing.pct} label={analysing.label} />
              <p className="text-xs text-muted-foreground">{analysing.label}…</p>
            </div>
          )}
          {analysisError != null && (
            <div className="mt-4">
              <ErrorBanner error={analysisError} />
            </div>
          )}
          <StepNav
            onBack={() => setStep(0)}
            onNext={() => void toMap()}
            nextDisabled={nothingChosen || Boolean(analysing)}
            nextLabel="Read and map"
          />
        </>
      )}

      {step === 2 && analysis && rows && (
        <>
          <StepTitle
            title="Map resources"
            description={`Matched by name where possible. ${analysis.taskGroups.length} task group${analysis.taskGroups.length === 1 ? '' : 's'} will be created (or reused when one with the same name exists).`}
          />
          <div className="space-y-6">
            <MapTable
              title="Agent pools"
              rows={rows.queues}
              options={analysis.target.queues.map((q) => ({ value: String(q.id), label: q.name }))}
              value={mapping.queues}
              onChange={set('queues')}
              unmappedLabel="No match (set it later)"
            />
            <MapTable
              title="Service connections"
              description="Credentials never copy. Create missing ones in the target, then go back and forward to refresh."
              rows={rows.endpoints}
              options={analysis.target.endpoints.map((e) => ({
                value: e.id,
                label: e.name,
                description: e.type,
              }))}
              value={mapping.endpoints}
              onChange={set('endpoints')}
              unmappedLabel="No match (clear the input)"
            />
            <MapTable
              title="Variable groups"
              rows={rows.groups}
              options={analysis.target.groups.map((g) => ({ value: String(g.id), label: g.name }))}
              value={mapping.groups}
              onChange={set('groups')}
              extraOptions={[
                {
                  value: CREATE,
                  label: 'Copy it to the target',
                  description: 'Secrets are created empty',
                },
              ]}
              unmappedLabel="No match (unlink it)"
            />
            <MapTable
              title="Repositories"
              description="Pipelines whose repo has no match are skipped."
              rows={rows.repos}
              options={analysis.target.repos.map((r) => ({ value: r.id, label: r.name }))}
              value={mapping.repos}
              onChange={set('repos')}
              unmappedLabel="No match (skip these pipelines)"
            />
            <MapTable
              title="Deployment groups"
              rows={rows.deploymentGroups}
              options={analysis.target.deploymentGroups.map((d) => ({
                value: String(d.id),
                label: d.name,
              }))}
              value={mapping.deploymentGroups}
              onChange={set('deploymentGroups')}
              unmappedLabel="No match (create it later)"
            />
            <MapTable
              title="Build pipelines used by releases"
              description="These aren't selected for migration; point each release artifact at an existing pipeline in the target."
              rows={rows.builds}
              options={analysis.target.builds.map((b) => ({ value: String(b.id), label: b.name }))}
              value={mapping.builds}
              onChange={set('builds')}
              unmappedLabel="No match (remove the artifact)"
            />

            {missing.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-13 font-semibold">
                  <Puzzle className="h-4 w-4" /> Tasks not installed in the target
                </h3>
                <ul className="divide-y divide-border-subtle rounded-lg border">
                  {missing.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-13">
                      <span className="flex-1">{t.friendlyName ?? t.name}</span>
                      <a
                        href={
                          t.contributionIdentifier
                            ? marketplaceLink(t.contributionIdentifier)
                            : adoLinks.extensions(target!.organization)
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium underline underline-offset-2"
                      >
                        Find the extension
                      </a>
                    </li>
                  ))}
                </ul>
                <ChoiceGroup<'block' | 'disable'>
                  label="Pipelines that use them"
                  value={missingTaskMode}
                  onChange={setMissingTaskMode}
                  choices={[
                    {
                      value: 'block',
                      label: 'Skip those pipelines',
                      detail: 'Install the extension, then run again.',
                    },
                    {
                      value: 'disable',
                      label: 'Create them with the step disabled',
                      detail: 'Enable it after installing the extension.',
                    },
                  ]}
                />
              </section>
            )}
            {analysis.target.taskIds === null && (
              <Callout variant="warning">
                The target's installed tasks couldn't be read, so missing extensions can't be
                checked in advance.
              </Callout>
            )}

            <ChoiceGroup<'skip' | 'suffix'>
              label="When a pipeline with the same name already exists in the target"
              value={clash}
              onChange={setClash}
              choices={[
                { value: 'skip', label: 'Skip it', detail: 'Releases still use the existing one.' },
                { value: 'suffix', label: 'Create a copy', detail: 'Named "<name> (migrated)".' },
              ]}
            />
            <ToggleRow
              label="Keep release approvers"
              detail="Off by default: approvals become automatic and the original approvers are listed in the report. On: approvers are matched by account to members of the target project; any that don't match fall back to automatic."
              checked={mapApprovers}
              onChange={setMapApprovers}
            />
          </div>
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            hint={
              unmappedRepos.length > 0
                ? `${unmappedRepos.length} repo${unmappedRepos.length === 1 ? '' : 's'} without a match: pipelines using them will be skipped.`
                : undefined
            }
          />
        </>
      )}

      {step === 3 && analysis && (
        <>
          <StepTitle title="Review" />
          <ReviewPanel
            summary={
              <p>
                Create <strong>{analysis.taskGroups.length}</strong> task group
                {analysis.taskGroups.length === 1 ? '' : 's'},{' '}
                <strong>{analysis.builds.length}</strong> build pipeline
                {analysis.builds.length === 1 ? '' : 's'} and{' '}
                <strong>{analysis.releases.length}</strong> release pipeline
                {analysis.releases.length === 1 ? '' : 's'} in <strong>{labels.target}</strong>,
                copied from <strong>{labels.source}</strong>. Secret variables are created empty.
              </p>
            }
            predicted={predicted()}
            acknowledged={ack}
            onAcknowledge={setAck}
          />
          <StepNav
            onBack={() => setStep(2)}
            next={
              <Button size="sm" onClick={() => void start()} disabled={!ack}>
                <Play />
                Start migration
              </Button>
            }
          />
        </>
      )}

      {step === 2 && !analysis && (
        <>
          <Callout variant="info">Choose pipelines first.</Callout>
          <StepNav onBack={() => setStep(1)} />
        </>
      )}

      {step === 4 && (
        <>
          <StepTitle title="Migrating" />
          <RunPanel run={run} />
        </>
      )}

      {step === 5 && (
        <>
          <StepTitle title="Migration report" />
          <ReportView
            title="Pipelines migration"
            source={labels.source}
            target={labels.target}
            counts={run.counts}
            items={run.report}
            failures={run.failures}
            cancelled={run.state === 'cancelled'}
            onRetry={ready && analysis ? () => void start() : undefined}
          />
        </>
      )}
    </MigrationShell>
  );
}

/** Turn rewrite notes into report items with links. */
function notesToReport(notes: RewriteNote[], what: string, link: string | undefined): ReportItem[] {
  return notes.map((n) => {
    const action: Record<RewriteNote['kind'], string> = {
      secret: 'Fill secret variable',
      endpoint: 'Set service connection',
      queue: 'Set agent pool',
      variableGroup: 'Link variable group',
      taskGroup: 'Fix task group step',
      repository: 'Set repository',
      artifact: 'Check release artifact',
      deploymentGroup: 'Create deployment group',
      approver: 'Set approvers',
      missingTask: 'Install extension',
      owner: 'Set stage owner',
    };
    return {
      area: 'Pipelines',
      severity: n.kind === 'artifact' && n.detail.includes('copied as is') ? 'warning' : 'action',
      title: action[n.kind],
      detail: `${what}: ${n.detail}`,
      targetUrl: link,
    };
  });
}

async function migratePipelines(
  api: RunApi,
  a: Analysis,
  s: Settings,
  source: AdoConnection,
  target: AdoConnection,
) {
  const tp = target.project!;
  const org = target.organization;
  const num = (v: string | undefined) =>
    v && v !== UNMAPPED && v !== CREATE ? Number(v) : undefined;

  const maps: IdMaps = {
    queues: new Map(),
    endpoints: new Map(),
    variableGroups: new Map(),
    taskGroups: new Map(),
    repos: new Map(),
    builds: new Map(),
    deploymentGroups: new Map(),
    missingTasks: new Set(missingTasks(a).map((t) => t.id.toLowerCase())),
  };
  for (const [k, v] of Object.entries(s.mapping.queues))
    if (num(v) !== undefined) maps.queues.set(Number(k), num(v)!);
  for (const [k, v] of Object.entries(s.mapping.deploymentGroups))
    if (num(v) !== undefined) maps.deploymentGroups.set(Number(k), num(v)!);
  for (const [k, v] of Object.entries(s.mapping.groups))
    if (num(v) !== undefined) maps.variableGroups.set(Number(k), num(v)!);
  for (const [k, v] of Object.entries(s.mapping.builds))
    if (num(v) !== undefined) maps.builds.set(Number(k), num(v)!);
  for (const [k, v] of Object.entries(s.mapping.endpoints))
    maps.endpoints.set(k.toLowerCase(), v === UNMAPPED ? '' : v);
  for (const [k, v] of Object.entries(s.mapping.repos)) {
    const repo = a.target.repos.find((r) => r.id === v);
    if (repo) maps.repos.set(k, { id: repo.id, name: repo.name, url: repo.remoteUrl });
  }
  // A source connection the definitions mention but the table didn't list is cleared, never kept.
  for (const e of a.source.endpoints)
    if (!maps.endpoints.has(e.id.toLowerCase()) && a.deps.guids.has(e.id.toLowerCase()))
      maps.endpoints.set(e.id.toLowerCase(), '');

  if (s.mapApprovers) {
    try {
      const members = await listProjectMembers(target, tp.id);
      const byName = new Map(members.map((m) => [m.uniqueName.toLowerCase(), m.id]));
      maps.users = new Map();
      for (const [id, uniqueName] of a.deps.approvers) {
        const to = byName.get(uniqueName.toLowerCase());
        if (to) maps.users.set(id, to);
      }
    } catch {
      api.log('Approvers', "Couldn't read target project members; approvals become automatic.");
    }
  }

  let ownerId: string | undefined;
  try {
    ownerId = await getAuthenticatedUserId(target);
  } catch {
    ownerId = undefined;
  }

  // 1. Variable groups chosen as "Copy it to the target".
  const toCopy = Object.entries(s.mapping.groups)
    .filter(([, v]) => v === CREATE)
    .map(([k]) => Number(k));
  await api.phase(
    'Copying variable groups the pipelines use',
    toCopy.map<MigTask>((id) => {
      const g = a.source.groups.find((x) => x.id === id);
      return {
        key: `vg:${id}`,
        label: g?.name ?? `Group ${id}`,
        journal: { kind: 'group', sourceId: String(id) },
        run: async () => {
          if (!g) return { status: 'failed', message: 'Not found in the source.' };
          if (isKeyVaultGroup(g)) {
            api.report({
              area: 'Variable groups',
              severity: 'action',
              title: 'Recreate Key Vault-linked group',
              detail: `"${g.name}" is linked to Key Vault and wasn't copied. Pipelines that use it are unlinked from it.`,
              targetUrl: adoLinks.library(org, tp.name),
            });
            return { status: 'skipped', message: 'Linked to Key Vault; not copied.' };
          }
          const existing = a.target.groups.find(
            (x) => x.name.toLowerCase() === g.name.toLowerCase(),
          );
          if (existing)
            return {
              status: 'skipped',
              message: 'Already exists; using it.',
              targetId: String(existing.id),
            };
          const plan = planGroupCopy(g, 'placeholder');
          const created = await createVariableGroup(
            org,
            {
              name: g.name,
              description: g.description ?? '',
              type: 'Vsts',
              variables: plan.variables,
              variableGroupProjectReferences: [
                {
                  name: g.name,
                  description: g.description ?? '',
                  projectReference: { id: tp.id, name: tp.name },
                },
              ],
            },
            target,
          );
          api.report(
            plan.secrets.map((k) => ({
              area: 'Variable groups' as const,
              severity: 'action' as const,
              title: 'Fill secret value',
              detail: `${k} in "${g.name}"`,
              targetUrl: adoLinks.variableGroup(org, tp.name, created.id),
            })),
          );
          return {
            status: plan.secrets.length ? 'warning' : 'ok',
            message: plan.secrets.length ? `${plan.secrets.length} secrets to fill` : undefined,
            targetId: String(created.id),
          };
        },
      };
    }),
  );
  for (const [src, tgt] of await api.idMap('group'))
    maps.variableGroups.set(Number(src), Number(tgt));

  // 2. YAML environments named in the pipelines' YAML files.
  const yamlBuilds = a.builds.filter((b) => Number((b.process as Json | undefined)?.type) === 2);
  const envNames = new Set<string>();
  for (const b of yamlBuilds) {
    const repo = b.repository as Json | undefined;
    const file = String((b.process as Json).yamlFilename ?? '');
    if (repo?.type !== 'TfsGit' || !file) continue;
    const text = await getFileText(
      source,
      source.project!.id,
      String(repo.id),
      file,
      String(repo.defaultBranch ?? ''),
    );
    if (text) yamlEnvironments(text).forEach((n) => envNames.add(n));
  }
  const existingEnvs = new Map(a.target.environments.map((e) => [e.name.toLowerCase(), e]));
  await api.phase(
    'Creating YAML environments',
    [...envNames].map<MigTask>((name) => ({
      key: `env:${name}`,
      label: `Environment "${name}"`,
      journal: { kind: 'environment', sourceId: name.toLowerCase() },
      run: async () => {
        const found = existingEnvs.get(name.toLowerCase());
        if (found)
          return { status: 'skipped', message: 'Already exists.', targetId: String(found.id) };
        const env = await createEnvironment(target, tp.id, name, 'Created by ToolDock migration');
        api.report({
          area: 'Pipelines',
          severity: 'action',
          title: 'Add environment approvals and resources',
          detail: `Environment "${name}" was created empty: add its approvals, checks and resources (VMs, Kubernetes).`,
          targetUrl: adoLinks.environment(org, tp.name, env.id),
        });
        return { status: 'ok', targetId: String(env.id) };
      },
    })),
  );

  // 3. Task groups, nested ones first.
  const ctx = () => ({
    maps,
    target: { projectId: tp.id, projectName: tp.name },
    missingTaskMode: s.missingTaskMode,
    ownerId,
  });
  for (const [src, tgt] of await api.idMap('taskgroup')) maps.taskGroups.set(src, tgt);
  for (const g of a.taskGroups) {
    const id = String(g.id).toLowerCase();
    if (maps.taskGroups.has(id)) continue;
    const same = a.target.taskGroups.find(
      (t) => String(t.name).toLowerCase() === String(g.name).toLowerCase() && !t.deleted,
    );
    if (same) maps.taskGroups.set(id, String(same.id));
  }
  await api.phase(
    'Creating task groups',
    a.taskGroups.map<MigTask>((g) => ({
      key: `tg:${String(g.id)}`,
      label: `Task group "${String(g.name)}"`,
      journal: { kind: 'taskgroup', sourceId: String(g.id).toLowerCase() },
      run: async () => {
        const id = String(g.id).toLowerCase();
        const reuse = maps.taskGroups.get(id);
        if (reuse)
          return {
            status: 'skipped',
            message: 'A task group with this name exists in the target; using it.',
            targetId: reuse,
          };
        const r = rewriteTaskGroup(g, ctx());
        if (r.blocked) return { status: 'failed', message: r.blocked };
        const created = await createTaskGroup(target, tp.id, r.body);
        maps.taskGroups.set(id, String(created.id));
        api.report(notesToReport(r.notes, `Task group "${String(g.name)}"`, undefined));
        return { status: r.notes.length ? 'warning' : 'ok', targetId: String(created.id) };
      },
    })),
    1, // sequential: later groups may use earlier ones
  );
  for (const [src, tgt] of await api.idMap('taskgroup')) maps.taskGroups.set(src, tgt);

  // 4. Build pipelines.
  const targetBuilds = [...a.target.builds];
  for (const [src, tgt] of await api.idMap('build')) maps.builds.set(Number(src), Number(tgt));
  await api.phase(
    'Creating build pipelines',
    a.builds.map<MigTask>((b) => ({
      key: `build:${String(b.id)}`,
      label: String(b.name),
      journal: { kind: 'build', sourceId: String(b.id) },
      run: async () => {
        const exists = targetBuilds.find(
          (t) => t.name.toLowerCase() === String(b.name).toLowerCase(),
        );
        let name = String(b.name);
        if (exists && s.clash === 'skip') {
          maps.builds.set(Number(b.id), exists.id);
          return {
            status: 'skipped',
            message: 'Exists in the target; releases will use it.',
            targetId: String(exists.id),
          };
        }
        if (exists) name = `${name} (migrated)`;
        const r = rewriteBuildDefinition({ ...b, name }, ctx());
        if (r.blocked) return { status: 'failed', message: r.blocked };
        const created = await createBuildDefinition(target, tp.id, r.body);
        maps.builds.set(Number(b.id), created.id);
        targetBuilds.push({ id: created.id, name });
        const link = adoLinks.buildPipeline(org, tp.name, created.id);
        api.report(notesToReport(r.notes, `Pipeline "${name}"`, link));
        if (Number((b.process as Json | undefined)?.type) === 2) {
          api.report({
            area: 'Pipelines',
            severity: 'action',
            title: 'Authorize resources on first run',
            detail: `"${name}" is a YAML pipeline: its first run asks to authorize service connections, pools, environments and variable groups. Check that every service connection named in the YAML exists in the target.`,
            targetUrl: link,
          });
        }
        return { status: r.notes.length ? 'warning' : 'ok', targetId: String(created.id) };
      },
    })),
  );

  // 5. Release pipelines.
  await api.phase(
    'Creating release pipelines',
    a.releases.map<MigTask>((rd) => ({
      key: `release:${String(rd.id)}`,
      label: String(rd.name),
      journal: { kind: 'release', sourceId: String(rd.id) },
      run: async () => {
        const exists = a.target.releases.find(
          (t) => t.name.toLowerCase() === String(rd.name).toLowerCase(),
        );
        if (exists && s.clash === 'skip')
          return {
            status: 'skipped',
            message: 'Exists in the target.',
            targetId: String(exists.id),
          };
        const name = exists ? `${String(rd.name)} (migrated)` : String(rd.name);
        const r = rewriteReleaseDefinition({ ...rd, name }, ctx());
        if (r.blocked) return { status: 'failed', message: r.blocked };
        let created: Json & { id: number };
        try {
          created = await createReleaseDefinition(target, tp.id, r.body);
        } catch (e) {
          // A folder that doesn't exist in the target: retry in the root folder.
          if (
            e instanceof AdoError &&
            e.kind === 'rejected' &&
            /folder|path/i.test(e.message) &&
            r.body.path &&
            r.body.path !== '\\'
          ) {
            created = await createReleaseDefinition(target, tp.id, { ...r.body, path: '\\' });
            r.notes.push({
              kind: 'owner',
              detail: `created in the root folder because "${String(r.body.path)}" doesn't exist in the target`,
            });
          } else throw e;
        }
        api.report(
          notesToReport(
            r.notes,
            `Release "${name}"`,
            adoLinks.releasePipeline(org, tp.name, created.id),
          ),
        );
        return { status: r.notes.length ? 'warning' : 'ok', targetId: String(created.id) };
      },
    })),
  );

  api.report([
    {
      area: 'General',
      severity: 'action',
      title: 'Revoke both tokens',
      detail: 'When you have finished, revoke the source and target tokens (or let them expire).',
      targetUrl: adoLinks.tokens(org),
    },
  ]);
}
