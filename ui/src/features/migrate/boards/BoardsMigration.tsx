import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { Field } from '@/components/common/Field';
import { ProgressBar } from '@/components/common/ProgressBar';
import { readAdoComments, readAdoSnapshot } from '@/lib/migration/boards/readers/ado';
import { useMigrationStore } from '@/store/migrationStore';
import { MIGRATIONS } from '../registry';
import { StepTitle } from '../components/MigrationShell';
import { useJobParam } from '../components/jobs';
import { ChoiceGroup } from '../components/Options';
import { WorkItemsWizard, type ScopeStepProps } from './WorkItemsWizard';
import { buildWiql } from './wiql';

const DEF = MIGRATIONS.find((m) => m.id === 'boards')!;

function AdoScope({ onLoaded, initialScope }: ScopeStepProps) {
  const source = useMigrationStore((s) => (s.source?.kind === 'ado' ? s.source : null));
  const init = (initialScope ?? {}) as {
    mode?: 'filter' | 'wiql';
    wiql?: string;
    types?: string;
    states?: string;
    area?: string;
    changedSince?: string;
    closed?: boolean;
  };
  const [mode, setMode] = useState<'filter' | 'wiql'>(init.mode ?? 'filter');
  const [types, setTypes] = useState(init.types ?? '');
  const [states, setStates] = useState(init.states ?? '');
  const [area, setArea] = useState(init.area ?? '');
  const [changedSince, setChangedSince] = useState(init.changedSince ?? '');
  const [closed, setClosed] = useState(init.closed ?? true);
  const [wiql, setWiql] = useState(init.wiql ?? '');
  const [busy, setBusy] = useState<{ label: string; pct: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  if (!source?.project) return null;

  const query =
    mode === 'wiql'
      ? wiql
      : buildWiql(source.project.name, { types, states, area, changedSince, closed });

  const load = async () => {
    setError(null);
    setBusy({ label: 'Starting', pct: 2 });
    try {
      const snap = await readAdoSnapshot(source, source.project!, query, (label, pct) =>
        setBusy({ label, pct }),
      );
      onLoaded(snap, { mode, wiql, types, states, area, changedSince, closed });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <StepTitle
        title="Choose work items"
        description={`From ${source.organization} / ${source.project.name}. Up to 20,000 items per run.`}
      />
      <div className="space-y-4">
        <ChoiceGroup<'filter' | 'wiql'>
          label="How to choose"
          value={mode}
          onChange={setMode}
          choices={[
            { value: 'filter', label: 'Simple filter' },
            {
              value: 'wiql',
              label: 'WIQL query',
              detail: 'Paste a query from the query editor (Edit WIQL).',
            },
          ]}
        />
        {mode === 'filter' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Types"
              hint="Comma-separated, e.g. Epic, Feature, User Story. Empty for all."
            >
              <Input value={types} onChange={(e) => setTypes(e.target.value)} />
            </Field>
            <Field label="States" hint="Comma-separated. Empty for all.">
              <Input value={states} onChange={(e) => setStates(e.target.value)} />
            </Field>
            <Field label="Area path (and below)" hint={`e.g. ${source.project.name}\\Team A`}>
              <Input value={area} onChange={(e) => setArea(e.target.value)} />
            </Field>
            <Field label="Changed since" hint="Optional.">
              <Input
                type="date"
                value={changedSince}
                onChange={(e) => setChangedSince(e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-13 sm:col-span-2">
              <input
                type="checkbox"
                checked={closed}
                onChange={(e) => setClosed(e.target.checked)}
              />
              Include closed, done and removed items
            </label>
          </div>
        ) : (
          <Field label="WIQL">
            <Textarea
              value={wiql}
              onChange={(e) => setWiql(e.target.value)}
              rows={6}
              className="font-mono text-13"
              placeholder="SELECT [System.Id] FROM WorkItems WHERE …"
            />
          </Field>
        )}
        <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium">Query that will run</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{query}</pre>
        </details>
        {busy && (
          <div className="space-y-1.5">
            <ProgressBar value={busy.pct} label={busy.label} />
            <p className="text-xs text-muted-foreground">{busy.label}…</p>
          </div>
        )}
        {error != null && <ErrorBanner error={error} />}
        <Button
          size="sm"
          onClick={() => void load()}
          disabled={Boolean(busy) || (mode === 'wiql' && !wiql.trim())}
        >
          {busy && <Loader2 className="animate-spin" />}
          Read work items
        </Button>
      </div>
    </>
  );
}

export default function BoardsMigration() {
  const resumeJob = useJobParam();
  return (
    <WorkItemsWizard
      def={DEF}
      sourceKind="ado"
      resumeJob={resumeJob}
      scopeStep={(props) => <AdoScope {...props} />}
      loadComments={(item) => {
        const s = useMigrationStore.getState().source;
        if (!s || s.kind !== 'ado' || !s.project) return Promise.resolve([]);
        return readAdoComments(s, s.project.name, item);
      }}
      sourceAuth={() => {
        const s = useMigrationStore.getState().source;
        return s && s.kind === 'ado' ? { ado: { organization: s.organization, pat: s.pat } } : null;
      }}
    />
  );
}
