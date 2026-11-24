import { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, Eye, EyeOff, Loader2, LogOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { Field } from '@/components/common/Field';
import { LockTimer } from '@/components/common/LockTimer';
import { listProjects } from '@/lib/api/projects';
import { getMyself } from '@/lib/api/migrate/jira';
import { cn } from '@/lib/utils/cn';
import { useMigrationStore, tokenTail, type Side } from '@/store/migrationStore';
import type { ScopeNeed } from '../registry';
import { disconnectSide, lockSide, unlockSide } from '../locks';

const ORG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const SITE_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

const SIDE_LABEL: Record<Side, string> = { source: 'Source', target: 'Target' };

function TokenInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="pr-10 font-mono"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        aria-label={show ? 'Hide token' : 'Show token'}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function ScopeList({ scopes }: { scopes: ScopeNeed[] }) {
  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {scopes.map((s) => (
        <li key={s.name}>
          <span className="font-medium text-foreground">{s.name}</span> · {s.why}
        </li>
      ))}
    </ul>
  );
}

function AdoConnectForm({ side, scopes }: { side: Side; scopes: ScopeNeed[] }) {
  const setConn = useMigrationStore((s) => (side === 'source' ? s.setSource : s.setTarget));
  const [org, setOrg] = useState('');
  const [pat, setPat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const o = org.trim();
  const canSubmit = ORG_PATTERN.test(o) && pat.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const projects = await listProjects(o, { patOverride: pat.trim() });
      setConn({
        kind: 'ado',
        organization: o,
        pat: pat.trim(),
        projects,
        project: projects.length === 1 ? projects[0]! : null,
        lockedAt: null,
      });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${side}-org`} className="text-13 font-medium text-foreground">
          Organization
        </label>
        <div className="flex h-9 items-center rounded-md border border-input bg-background focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/40">
          <span className="select-none pl-3 font-mono text-13 text-muted-foreground">
            dev.azure.com/
          </span>
          <input
            id={`${side}-org`}
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="your-org"
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent pr-3 font-mono text-13 placeholder:text-muted-foreground/50 focus:outline-none"
          />
        </div>
      </div>
      <Field label="Personal Access Token">
        <TokenInput value={pat} onChange={setPat} placeholder="Paste a token" />
      </Field>
      <details className="rounded-md border border-border-subtle bg-muted/40 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium">
          Token scopes for this side {side === 'source' ? '(read-only is enough)' : ''}
        </summary>
        <div className="mt-2 space-y-2">
          <ScopeList scopes={scopes} />
          {ORG_PATTERN.test(o) && (
            <a
              href={`https://dev.azure.com/${o}/_usersSettings/tokens`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
            >
              Create a token <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </details>
      {error != null && <ErrorBanner error={error} />}
      <Button type="submit" size="sm" disabled={!canSubmit}>
        {busy && <Loader2 className="animate-spin" />}
        {busy ? 'Checking…' : `Connect ${SIDE_LABEL[side].toLowerCase()}`}
      </Button>
    </form>
  );
}

function JiraConnectForm() {
  const setSource = useMigrationStore((s) => s.setSource);
  const [site, setSite] = useState('');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const s = site
    .trim()
    .toLowerCase()
    .replace(/\.atlassian\.net\/?$/, '')
    .replace(/^https?:\/\//, '');
  const canSubmit = SITE_PATTERN.test(s) && email.includes('@') && token.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const me = await getMyself({ site: s, email: email.trim(), token: token.trim() });
      setSource({
        kind: 'jira',
        site: s,
        email: email.trim(),
        token: token.trim(),
        displayName: me.displayName,
        lockedAt: null,
      });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="jira-site" className="text-13 font-medium text-foreground">
          Jira site
        </label>
        <div className="flex h-9 items-center rounded-md border border-input bg-background focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/40">
          <input
            id="jira-site"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="your-site"
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent pl-3 font-mono text-13 placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <span className="select-none pr-3 font-mono text-13 text-muted-foreground">
            .atlassian.net
          </span>
        </div>
      </div>
      <Field label="Account email">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field label="API token" hint="Jira Cloud only. The proxy only allows reads from Jira.">
        <TokenInput value={token} onChange={setToken} placeholder="Paste an API token" />
      </Field>
      <a
        href="https://id.atlassian.com/manage-profile/security/api-tokens"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
      >
        Create an API token <ExternalLink className="h-3 w-3" />
      </a>
      {error != null && <ErrorBanner error={error} />}
      <div>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {busy && <Loader2 className="animate-spin" />}
          {busy ? 'Checking…' : 'Connect Jira'}
        </Button>
      </div>
    </form>
  );
}

interface ConnectionCardProps {
  side: Side;
  kind: 'ado' | 'jira';
  scopes: ScopeNeed[];
  /** Target only: offer to reuse the source organization and token. */
  onUseSource?: () => void;
}

/**
 * One side of a migration. The source card is neutral; the target card has an
 * amber edge because it's the side that gets written to.
 */
export function ConnectionCard({ side, kind, scopes, onUseSource }: ConnectionCardProps) {
  const conn = useMigrationStore((s) => s[side]);
  const running = useMigrationStore((s) => s.running);
  const setConn = useMigrationStore((s) => (side === 'source' ? s.setSource : s.setTarget));
  const setProject = useMigrationStore((s) => s.setProject);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);

  // A connection restored from its lock has no project list yet.
  useEffect(() => {
    if (!conn || conn.kind !== 'ado' || conn.projects.length > 0) return;
    let cancelled = false;
    listProjects(conn.organization, { patOverride: conn.pat })
      .then((projects) => {
        if (cancelled) return;
        const current = useMigrationStore.getState()[side];
        if (current && current.kind === 'ado') setConn({ ...current, projects } as never);
      })
      .catch((e) => !cancelled && setLoadError(e));
    return () => {
      cancelled = true;
    };
  }, [conn, side, setConn]);

  const wrap = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label={`${SIDE_LABEL[side]} connection`}
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 shadow-card',
        side === 'target' && 'border-warning-border shadow-[inset_3px_0_0_hsl(var(--warning))]',
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {SIDE_LABEL[side]} · {side === 'source' ? 'read from' : 'written to'}
          </p>
          <p className="font-display text-sm font-semibold">
            {conn
              ? conn.kind === 'jira'
                ? `${conn.site}.atlassian.net`
                : conn.organization
              : kind === 'jira'
                ? 'Jira Cloud'
                : 'Azure DevOps'}
          </p>
        </div>
        {conn && (
          <div className="flex items-center gap-1">
            <span
              className="mr-1 font-mono text-xs text-muted-foreground"
              title="Last characters of the token"
            >
              {tokenTail(conn.kind === 'jira' ? conn.token : conn.pat)}
            </span>
            <LockTimer
              subject={`${SIDE_LABEL[side].toLowerCase()} token`}
              lockedAt={conn.lockedAt}
              busy={busy}
              migrationRunning={running}
              onLock={wrap(() => lockSide(side))}
              onUnlock={wrap(() => unlockSide(side))}
              onExpire={() => void unlockSide(side)}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => void disconnectSide(side)}
                  aria-label={`Disconnect ${SIDE_LABEL[side].toLowerCase()}`}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive-subtle hover:text-destructive disabled:opacity-40"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {running ? 'Stop the migration first' : 'Disconnect and clear the token'}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </header>

      {!conn &&
        (kind === 'jira' ? (
          <JiraConnectForm />
        ) : (
          <>
            {onUseSource && (
              <Button variant="outline" size="sm" className="self-start" onClick={onUseSource}>
                <RotateCcw />
                Same organization and token as the source
              </Button>
            )}
            <AdoConnectForm side={side} scopes={scopes} />
          </>
        ))}

      {conn?.kind === 'jira' && (
        <p className="text-13 text-muted-foreground">
          Signed in as{' '}
          <span className="font-medium text-foreground">{conn.displayName ?? conn.email}</span>.
          Choose the Jira project in the next step.
        </p>
      )}

      {conn?.kind === 'ado' && (
        <div className="space-y-2">
          <Field label="Project">
            <Combobox
              options={conn.projects.map((p) => ({ value: p.id, label: p.name }))}
              value={conn.project?.id}
              onChange={(id) => setProject(side, conn.projects.find((p) => p.id === id) ?? null)}
              placeholder={
                conn.projects.length === 0 && !loadError ? 'Loading projects…' : 'Choose a project'
              }
              searchPlaceholder="Find a project"
              disabled={running}
            />
          </Field>
          {loadError != null && <ErrorBanner error={loadError} />}
          {conn.restored && (
            <p className="text-xs text-muted-foreground">Restored from lock after a refresh.</p>
          )}
        </div>
      )}
    </section>
  );
}

/** Source → Target cards side by side, with the same-project warning. */
export function ConnectionsStep({
  sourceKind,
  scopes,
}: {
  sourceKind: 'ado' | 'jira';
  scopes: { source: ScopeNeed[]; target: ScopeNeed[] };
}) {
  const source = useMigrationStore((s) => s.source);
  const target = useMigrationStore((s) => s.target);
  const setTarget = useMigrationStore((s) => s.setTarget);
  const wrongKind = source && source.kind !== sourceKind;

  const sameProject =
    source?.kind === 'ado' &&
    target &&
    source.organization.toLowerCase() === target.organization.toLowerCase() &&
    source.project &&
    source.project.id === target.project?.id;

  return (
    <div className="space-y-3">
      {wrongKind && (
        <div className="rounded-lg border border-warning-border bg-warning-subtle px-4 py-3 text-13">
          The source connected now is {source.kind === 'jira' ? 'Jira' : 'Azure DevOps'}, but this
          migration reads from {sourceKind === 'jira' ? 'Jira' : 'Azure DevOps'}.{' '}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => void disconnectSide('source')}
          >
            Disconnect the source
          </button>{' '}
          to connect the right one.
        </div>
      )}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <ConnectionCard side="source" kind={sourceKind} scopes={scopes.source} />
        <ArrowRight
          className="mx-auto mt-10 hidden h-5 w-5 text-muted-foreground lg:block"
          aria-hidden
        />
        <ConnectionCard
          side="target"
          kind="ado"
          scopes={scopes.target}
          onUseSource={
            source?.kind === 'ado'
              ? () =>
                  setTarget({
                    kind: 'ado',
                    organization: source.organization,
                    pat: source.pat,
                    projects: source.projects,
                    project: null,
                    lockedAt: null,
                  })
              : undefined
          }
        />
      </div>
      {sameProject && (
        <div className="rounded-lg border border-destructive-border bg-destructive-subtle px-4 py-3 text-13">
          Source and target are the same project. Choose a different target project.
        </div>
      )}
    </div>
  );
}
