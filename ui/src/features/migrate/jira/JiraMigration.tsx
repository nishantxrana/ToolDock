import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/textarea';
import { Callout } from '@/components/common/Callout';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { Field } from '@/components/common/Field';
import { ProgressBar } from '@/components/common/ProgressBar';
import { listJiraProjects } from '@/lib/api/migrate/jira';
import { readJiraComments, readJiraSnapshot } from '@/lib/migration/boards/readers/jira';
import { useMigrationStore } from '@/store/migrationStore';
import { MIGRATIONS } from '../registry';
import { StepTitle } from '../components/MigrationShell';
import { useJobParam } from '../components/jobs';
import { WorkItemsWizard, type ScopeStepProps } from '../boards/WorkItemsWizard';
import { buildJql } from './jql';

const DEF = MIGRATIONS.find((m) => m.id === 'jira')!;

function JiraScope({ onLoaded, initialScope }: ScopeStepProps) {
  const source = useMigrationStore((s) => (s.source?.kind === 'jira' ? s.source : null));
  const init = (initialScope ?? {}) as { projectKey?: string; extra?: string };
  const [projectKey, setProjectKey] = useState(init.projectKey ?? '');
  const [extra, setExtra] = useState(init.extra ?? '');
  const [busy, setBusy] = useState<{ label: string; pct: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const projects = useQuery({
    queryKey: ['mig', 'jira', source?.site, 'projects'],
    enabled: Boolean(source),
    queryFn: () => listJiraProjects(source!),
  });
  if (!source) return null;

  const load = async () => {
    setError(null);
    setBusy({ label: 'Starting', pct: 2 });
    try {
      const snap = await readJiraSnapshot(
        source,
        projectKey,
        buildJql(projectKey, extra),
        (label, pct) => setBusy({ label, pct }),
      );
      onLoaded(snap, { projectKey, extra });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <StepTitle
        title="Choose Jira issues"
        description={`From ${source.site}.atlassian.net. Jira is only read, never changed.`}
      />
      <div className="space-y-4">
        {projects.isError && (
          <ErrorBanner error={projects.error} onRetry={() => projects.refetch()} />
        )}
        <Field label="Jira project">
          <Combobox
            options={(projects.data ?? []).map((p) => ({
              value: p.key,
              label: `${p.name} (${p.key})`,
            }))}
            value={projectKey}
            onChange={setProjectKey}
            placeholder={projects.isLoading ? 'Loading projects…' : 'Choose a project'}
            searchPlaceholder="Find a project"
          />
        </Field>
        <Field
          label="Extra JQL filter (optional)"
          hint="e.g. statusCategory != Done AND created >= -365d"
        >
          <Textarea
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            rows={3}
            className="font-mono text-13"
          />
        </Field>
        {projectKey && (
          <p className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">
            {buildJql(projectKey, extra)}
          </p>
        )}
        <Callout variant="info">
          Jira often hides people's email addresses, so people are matched by name when user mapping
          is on. Subtasks become child items, and sprints become iterations.
        </Callout>
        {busy && (
          <div className="space-y-1.5">
            <ProgressBar value={busy.pct} label={busy.label} />
            <p className="text-xs text-muted-foreground">{busy.label}…</p>
          </div>
        )}
        {error != null && <ErrorBanner error={error} />}
        <Button size="sm" onClick={() => void load()} disabled={!projectKey || Boolean(busy)}>
          {busy && <Loader2 className="animate-spin" />}
          Read issues
        </Button>
      </div>
    </>
  );
}

export default function JiraMigration() {
  const resumeJob = useJobParam();
  return (
    <WorkItemsWizard
      def={DEF}
      sourceKind="jira"
      resumeJob={resumeJob}
      jiraDefaults
      scopeStep={(props) => <JiraScope {...props} />}
      loadComments={(item) => {
        const s = useMigrationStore.getState().source;
        return s && s.kind === 'jira' ? readJiraComments(s, item) : Promise.resolve([]);
      }}
      sourceAuth={() => {
        const s = useMigrationStore.getState().source;
        return s && s.kind === 'jira'
          ? { jira: { site: s.site, email: s.email, token: s.token } }
          : null;
      }}
    />
  );
}
