import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Loader2, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout } from '@/components/common/Callout';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  createImportRequest,
  createPolicy,
  createRepo,
  getImportRequest,
  listPolicies,
  listRepos,
  type GitRepo,
  type PolicyConfiguration,
} from '@/lib/api/migrate/git';
import { createGitImportEndpoint, deleteEndpoint } from '@/lib/api/migrate/serviceEndpoints';
import { sleep } from '@/lib/api/migrate/http';
import { adoLinks } from '@/lib/migration/links';
import type { ReportItem } from '@/lib/migration/report';
import { useMigrationStore, type AdoConnection } from '@/store/migrationStore';
import { MIGRATIONS } from '../registry';
import { cleanRemoteUrl, formatSize, isEmptyRepo, rewritePolicy, targetPlan } from './repoPlan';
import { ConnectionsStep } from '../components/ConnectionCard';
import { MigrationShell, StepTitle } from '../components/MigrationShell';
import { prepareJob, sideLabels, useConnectionsReady, useJobParam } from '../components/jobs';
import { PickList, type PickRow } from '../components/PickList';
import { ToggleRow } from '../components/Options';
import { ReviewPanel, StepNav } from '../components/Wizard';
import { RunPanel } from '../components/RunPanel';
import { ReportView } from '../components/ReportView';
import { useMigrationRun, type MigTask, type RunApi } from '../useMigrationRun';

const DEF = MIGRATIONS.find((m) => m.id === 'repos')!;
const STEPS = [
  { id: 'connect', label: 'Connect' },
  { id: 'select', label: 'Choose repos' },
  { id: 'options', label: 'Names & options' },
  { id: 'review', label: 'Review' },
  { id: 'run', label: 'Migrate' },
  { id: 'report', label: 'Report' },
];

const IMPORT_TIMEOUT_MS = 60 * 60 * 1000;
const POLL_MS = 5000;

interface Settings {
  selected: string[];
  names: Record<string, string>;
  copyPolicies: boolean;
}

function useRepos(conn: AdoConnection | null, side: 'source' | 'target') {
  return useQuery({
    queryKey: ['mig', side, conn?.organization, conn?.project?.id, 'repos'],
    enabled: Boolean(conn?.project),
    queryFn: ({ signal }) => listRepos(conn!, conn!.project!.name, signal),
  });
}

export default function ReposMigration() {
  const resumeJob = useJobParam();
  const source = useMigrationStore((s) => (s.source?.kind === 'ado' ? s.source : null));
  const target = useMigrationStore((s) => s.target);
  const ready = useConnectionsReady('ado');
  const run = useMigrationRun();

  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>({});
  const [copyPolicies, setCopyPolicies] = useState(true);
  const [ack, setAck] = useState(false);

  const src = useRepos(source, 'source');
  const tgt = useRepos(target, 'target');
  const repos = useMemo(() => src.data ?? [], [src.data]);
  const targetRepos = useMemo(() => tgt.data ?? [], [tgt.data]);

  useEffect(() => {
    if (!resumeJob) return;
    const s = resumeJob.settings as unknown as Settings;
    setSelected(new Set(s.selected ?? []));
    setNames(s.names ?? {});
    setCopyPolicies(s.copyPolicies ?? true);
    if (resumeJob.status === 'done') void run.load(resumeJob).then(() => setStep(5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeJob]);

  const rows: PickRow[] = repos.map((r) => {
    const wiki = r.name.toLowerCase().endsWith('.wiki');
    return {
      id: r.id,
      label: r.name,
      detail: `${formatSize(r.size)}${r.defaultBranch ? ` · default ${r.defaultBranch.replace('refs/heads/', '')}` : ''}`,
      disabledReason: r.isDisabled
        ? "This repository is disabled in the source, so it can't be read. Enable it first to migrate it."
        : undefined,
      badges: (
        <>
          {wiki && (
            <Badge variant="info">
              <BookOpen className="h-3 w-3" />
              Wiki
            </Badge>
          )}
          {isEmptyRepo(r) && <Badge variant="secondary">Empty</Badge>}
          {(r.size ?? 0) > 5 * 1024 ** 3 && <Badge variant="warning">Over 5 GB</Badge>}
        </>
      ),
    };
  });

  const chosen = repos.filter((r) => selected.has(r.id) && !r.isDisabled);
  const nameOf = (r: GitRepo) => names[r.id] ?? r.name;
  const plans = chosen.map((r) => ({
    repo: r,
    name: nameOf(r),
    plan: targetPlan(nameOf(r), targetRepos),
  }));
  const duplicateNames = new Set(
    plans.map((p) => p.name.trim().toLowerCase()).filter((n, i, a) => a.indexOf(n) !== i),
  );
  const blocked = plans.filter(
    (p) =>
      p.plan === 'blocked' ||
      p.plan === 'invalid' ||
      duplicateNames.has(p.name.trim().toLowerCase()),
  );

  const predicted = (): ReportItem[] => {
    const items: ReportItem[] = [
      {
        area: 'Repos',
        severity: 'info',
        title: 'Pull requests not copied',
        detail:
          'Pull requests, their comments and reviews stay in the source. Branches are copied, so open work can be re-raised.',
      },
      {
        area: 'Repos',
        severity: 'warning',
        title: 'Git LFS files',
        detail:
          "The import doesn't copy Git LFS objects. If a repo uses LFS, push its LFS objects to the new repo with git lfs push --all.",
      },
      {
        area: 'Repos',
        severity: 'info',
        title: 'Permissions, forks and work item links',
        detail: 'Repository security, forks and commit-to-work-item links are not copied.',
      },
    ];
    if (copyPolicies) {
      items.push({
        area: 'Repos',
        severity: 'info',
        title: 'Some branch policies need redoing',
        detail:
          'Build validation and required-reviewer policies are left out (they point at pipelines and people). Each one is listed in the report.',
      });
    }
    for (const p of plans.filter((x) => (x.repo.size ?? 0) > 5 * 1024 ** 3)) {
      items.push({
        area: 'Repos',
        severity: 'warning',
        title: 'Large repository',
        detail: `${p.repo.name} is ${formatSize(p.repo.size)}. Imports of large repos can take a long time; Azure DevOps keeps going even if you close this tab.`,
      });
    }
    return items;
  };

  const start = async () => {
    if (!source || !target?.project) return;
    const settings: Settings = { selected: [...selected], names, copyPolicies };
    const job = await prepareJob(
      DEF,
      `Repos: ${source.project?.name} → ${target.project.name}`,
      { ...settings },
      // Reuse this run's job on "Retry failed", so finished items are skipped.
      run.job ?? resumeJob,
    );
    setStep(4);
    const upFront = predicted();
    await run.execute(job, (api) => {
      // What the Review step flagged belongs in the final report too.
      api.report(upFront);
      return migrateRepos(
        api,
        plans.map((p) => ({ repo: p.repo, name: p.name.trim() })),
        settings,
        source,
        target,
      );
    });
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
            description="Azure DevOps copies each repository itself, so nothing is downloaded to this browser."
          />
          {resumeJob && resumeJob.status !== 'done' && (
            <Callout variant="info" title="Resuming an earlier migration" className="mb-4">
              Reconnect to the same source and target. Repos already copied will be skipped.
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
            title="Choose repositories"
            description="Every branch, tag and commit of each repo is copied."
          />
          {src.isError && <ErrorBanner error={src.error} onRetry={() => src.refetch()} />}
          {src.isLoading ? (
            <p className="flex items-center gap-2 text-13 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading repositories…
            </p>
          ) : (
            <PickList
              rows={rows}
              selected={selected}
              onChange={setSelected}
              noun="repo"
              emptyText="The source project has no repositories."
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
          <StepTitle
            title="Names and options"
            description="Each repo keeps its name unless you change it. A repo must be new, or empty, in the target."
          />
          {tgt.isError && <ErrorBanner error={tgt.error} onRetry={() => tgt.refetch()} />}
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source repo</TableHead>
                  <TableHead>Name in target</TableHead>
                  <TableHead className="w-56">What happens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map(({ repo, name, plan }) => {
                  const dup = duplicateNames.has(name.trim().toLowerCase());
                  return (
                    <TableRow key={repo.id}>
                      <TableCell className="font-medium">{repo.name}</TableCell>
                      <TableCell>
                        <Input
                          value={name}
                          onChange={(e) => setNames((n) => ({ ...n, [repo.id]: e.target.value }))}
                          aria-label={`Name in target for ${repo.name}`}
                          className="h-8 font-mono text-13"
                        />
                      </TableCell>
                      <TableCell className="text-13">
                        {dup ? (
                          <span className="text-destructive">Two repos would get this name</span>
                        ) : plan === 'create' ? (
                          <span className="text-success">New repo</span>
                        ) : plan === 'import-into-empty' ? (
                          <span className="text-info">Exists but empty: import into it</span>
                        ) : plan === 'invalid' ? (
                          <span className="text-destructive">Not a valid repo name</span>
                        ) : (
                          <span className="text-destructive">Exists and has commits: rename</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4">
            <ToggleRow
              label="Copy branch policies"
              detail="Copies policies like minimum reviewers, linked work items and comment resolution. Build validation and required reviewers are listed in the report instead."
              checked={copyPolicies}
              onChange={setCopyPolicies}
            />
          </div>
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            nextDisabled={blocked.length > 0 || tgt.isLoading}
            hint={
              blocked.length > 0
                ? `Fix ${blocked.length} name${blocked.length === 1 ? '' : 's'} first.`
                : undefined
            }
          />
        </>
      )}

      {step === 3 && (
        <>
          <StepTitle title="Review" />
          <ReviewPanel
            summary={
              <div className="space-y-2">
                <p>
                  Copy <strong>{chosen.length}</strong> repo{chosen.length === 1 ? '' : 's'} from{' '}
                  <strong>{labels.source}</strong> to <strong>{labels.target}</strong>, with every
                  branch, tag and commit.
                </p>
                <p className="text-13 text-muted-foreground">
                  For each import, a temporary service connection holding the source token is
                  created in the target project. Azure DevOps deletes it when the import finishes,
                  and ToolDock deletes it if the import fails.
                </p>
              </div>
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

      {step === 4 && (
        <>
          <StepTitle
            title="Migrating"
            description="Each import runs inside Azure DevOps. Keep this tab open to follow progress and clean up."
          />
          <RunPanel run={run} />
        </>
      )}

      {step === 5 && (
        <>
          <StepTitle title="Migration report" />
          <ReportView
            title="Repos migration"
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

async function migrateRepos(
  api: RunApi,
  chosen: { repo: GitRepo; name: string }[],
  s: Settings,
  source: AdoConnection,
  target: AdoConnection,
) {
  const tProject = target.project!;
  const tOrg = target.organization;
  const existing = await listRepos(target, tProject.name, api.signal);
  let policies: PolicyConfiguration[] | null = null;
  if (s.copyPolicies) {
    try {
      policies = await listPolicies(source, source.project!.name);
    } catch (e) {
      api.report({
        area: 'Repos',
        severity: 'warning',
        title: "Couldn't read branch policies",
        detail: `Policies weren't copied: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const tasks: MigTask[] = chosen.map(({ repo, name }) => ({
    key: `repo:${repo.id}`,
    label: repo.name === name ? repo.name : `${repo.name} → ${name}`,
    journal: { kind: 'repo', sourceId: repo.id },
    run: async ({ signal }) => {
      // 1. The target repo: reuse an empty one, else create it.
      const match = existing.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (match && !isEmptyRepo(match)) {
        return {
          status: 'failed',
          message: `"${name}" already exists in the target and has commits.`,
        };
      }
      const created = match ?? (await createRepo(target, tProject.id, name));
      if (!match) existing.push(created);
      const repoLink = adoLinks.repo(tOrg, tProject.name, created.name);

      if (isEmptyRepo(repo)) {
        return {
          status: 'ok',
          message: 'Source is empty; created an empty repo.',
          targetId: created.id,
        };
      }

      // 2. Temporary connection holding the source token, then the import.
      const endpoint = await createGitImportEndpoint(
        target,
        { id: tProject.id, name: tProject.name },
        `tooldock-import-${name}-${Date.now().toString(36)}`.slice(0, 120),
        cleanRemoteUrl(repo.remoteUrl),
        source.pat,
      );
      // True only when the user stops mid-import: Azure DevOps is still using the
      // connection and deletes it itself when the import ends.
      let importStillRunning = false;
      try {
        const req = await createImportRequest(
          target,
          tProject.id,
          created.id,
          cleanRemoteUrl(repo.remoteUrl),
          endpoint.id,
        );
        const startedAt = Date.now();
        let status = req.status;
        let detail = req.detailedStatus;
        let lastStep = -1;
        while (status === 'queued' || status === 'inProgress') {
          if (Date.now() - startedAt > IMPORT_TIMEOUT_MS) {
            return {
              status: 'failed',
              message: 'The import took longer than 60 minutes. Check the repo in Azure DevOps.',
            };
          }
          try {
            await sleep(POLL_MS, signal);
          } catch {
            // Stopped by the user: the import carries on inside Azure DevOps,
            // which deletes the temporary connection when it's done.
            importStillRunning = true;
            api.report({
              area: 'Repos',
              severity: 'warning',
              title: 'Import still running',
              detail: `${name}: the run was stopped, but Azure DevOps keeps importing. Check the repo shortly.`,
              targetUrl: repoLink,
            });
            throw new DOMException('Aborted', 'AbortError');
          }
          const cur = await getImportRequest(target, tProject.id, created.id, req.importRequestId);
          status = cur.status;
          detail = cur.detailedStatus;
          const stepNo = detail?.currentStep ?? -1;
          if (stepNo !== lastStep && detail?.allSteps?.[stepNo - 1]) {
            api.log(`${name}: ${detail.allSteps[stepNo - 1]}`);
            lastStep = stepNo;
          }
        }
        if (status !== 'completed') {
          return { status: 'failed', message: detail?.errorMessage ?? `Import ${status}.` };
        }
      } finally {
        if (!importStillRunning) {
          // Never leave the source token behind: delete (it's usually gone
          // already), retry once, then flag it for the user.
          const gone =
            (await deleteEndpoint(target, endpoint.id, tProject.id)) ||
            (await deleteEndpoint(target, endpoint.id, tProject.id));
          if (!gone) {
            api.report({
              area: 'Repos',
              severity: 'action',
              title: 'Delete the temporary service connection',
              detail: `"${endpoint.name}" holds the source token and couldn't be removed automatically. Delete it now.`,
              targetUrl: adoLinks.serviceConnections(tOrg, tProject.name),
            });
          }
        }
      }

      // 3. Branch policies (optional).
      let copied = 0;
      if (policies) {
        for (const p of policies.filter((x) =>
          (x.settings.scope ?? []).some((sc) => sc.repositoryId === repo.id),
        )) {
          const r = rewritePolicy(p, repo.id, created.id);
          const label = p.type.displayName ?? 'Branch policy';
          if ('skip' in r) {
            api.report({
              area: 'Repos',
              severity: 'action',
              title: `Recreate "${label}" policy`,
              detail: `${name}: left out because it's ${r.skip}.`,
              targetUrl: adoLinks.branchPolicies(tOrg, tProject.name, created.id),
            });
            continue;
          }
          try {
            await createPolicy(target, tProject.id, r.body);
            copied++;
          } catch (e) {
            api.report({
              area: 'Repos',
              severity: 'warning',
              title: `"${label}" policy not copied`,
              detail: `${name}: ${e instanceof Error ? e.message : String(e)}`,
              targetUrl: adoLinks.branchPolicies(tOrg, tProject.name, created.id),
            });
          }
        }
      }

      return {
        status: 'ok',
        message: `Imported${copied ? ` · ${copied} polic${copied === 1 ? 'y' : 'ies'} copied` : ''}.`,
        targetId: created.id,
      };
    },
  }));

  await api.phase('Importing repositories', tasks, 2);
  api.report({
    area: 'General',
    severity: 'action',
    title: 'Revoke both tokens',
    detail: 'When you have finished, revoke the source and target tokens (or let them expire).',
    targetUrl: adoLinks.tokens(tOrg),
  });
}
