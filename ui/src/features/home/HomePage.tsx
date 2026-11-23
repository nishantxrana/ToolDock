import { Link } from 'react-router-dom';
import { PencilLine, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TOOLS, toolsByGroup } from '@/features/tools/registry';
import { useSessionStore } from '@/store/sessionStore';
import { cn } from '@/lib/utils/cn';
import type { ToolDefinition } from '@/types/tools';

/* ------------------------------------------------------------------------ */
/* Hero specimen: a miniature of what the compare tools produce.            */
/* ------------------------------------------------------------------------ */

type RowStatus = 'same' | 'changed' | 'missing' | 'secret';

const SPECIMEN: { key: string; dev: string; prod: string | null; status: RowStatus }[] = [
  { key: 'Auth__Authority', dev: 'login.contoso.com', prod: 'login.contoso.com', status: 'same' },
  { key: 'ConnectionStrings__Sql', dev: 'sql-dev-01', prod: 'sql-prod-01', status: 'changed' },
  { key: 'FeatureFlags__NewCheckout', dev: 'true', prod: null, status: 'missing' },
  { key: 'Jwt__SigningKey', dev: '••••••', prod: '••••••', status: 'secret' },
  { key: 'Logging__MinLevel', dev: 'Debug', prod: 'Warning', status: 'changed' },
];

const STATUS_STYLE: Record<RowStatus, { label: string; mark: string; text: string }> = {
  same: { label: 'Same', mark: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
  changed: { label: 'Changed', mark: 'bg-warning', text: 'text-warning' },
  missing: { label: 'Missing in prod', mark: 'bg-destructive', text: 'text-destructive' },
  secret: { label: 'Secret', mark: 'bg-info', text: 'text-info' },
};

function DiffSpecimen() {
  return (
    <figure
      className="overflow-hidden rounded-lg border bg-card shadow-card"
      aria-label="Example: two variable groups compared key by key"
    >
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
        <span>Key</span>
        <span>app-dev</span>
        <span>app-prod</span>
      </div>
      <ul className="font-mono text-[12.5px]">
        {SPECIMEN.map((row, i) => {
          const s = STATUS_STYLE[row.status];
          return (
            <li
              key={row.key}
              className="specimen-row relative grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] items-center border-b border-border/60 px-4 py-2 last:border-0"
              style={{ animationDelay: `${120 + i * 90}ms` }}
              title={s.label}
            >
              <span className={cn('absolute inset-y-1.5 left-0 w-[3px] rounded-r', s.mark)} />
              <span className="truncate pr-3 text-foreground">{row.key}</span>
              <span className="truncate pr-3 text-muted-foreground">{row.dev}</span>
              <span
                className={cn('truncate', row.status === 'same' ? 'text-muted-foreground' : s.text)}
              >
                {row.prod ?? '—'}
              </span>
            </li>
          );
        })}
      </ul>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        {(['changed', 'missing', 'secret'] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-sm', STATUS_STYLE[k].mark)} />
            {STATUS_STYLE[k].label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------------ */
/* Tool index                                                               */
/* ------------------------------------------------------------------------ */

function ToolLink({ tool, connected }: { tool: ToolDefinition; connected: boolean }) {
  const needsConnect = tool.requiresConnection && !connected;
  return (
    <Link
      to={tool.path}
      className="group -mx-3 flex gap-3.5 rounded-md px-3 py-3 transition-colors hover:bg-card focus-visible:bg-card"
    >
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors',
          needsConnect
            ? 'border-border bg-muted/50 text-muted-foreground'
            : 'border-primary/25 bg-accent text-accent-foreground',
        )}
      >
        <tool.icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium leading-snug decoration-border-strong underline-offset-[3px] group-hover:underline">
            {tool.title}
          </span>
          {tool.writesToAdo && (
            <span className="inline-flex items-center gap-1 rounded border border-warning/35 px-1.5 text-[11px] font-medium text-warning">
              <PencilLine className="h-3 w-3" />
              Writes to Azure DevOps
            </span>
          )}
          {!tool.requiresConnection && (
            <span className="rounded bg-success/10 px-1.5 text-[11px] font-medium text-success">
              No connection needed
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
          {tool.description}
        </span>
      </span>
    </Link>
  );
}

function ToolGroup({
  group,
  tools,
  connected,
}: {
  group: string;
  tools: readonly ToolDefinition[];
  connected: boolean;
}) {
  return (
    <section aria-labelledby={`group-${group}`}>
      <h2
        id={`group-${group}`}
        className="flex items-baseline gap-2 border-b pb-2 text-base font-semibold"
      >
        {group}
        <span className="font-sans text-sm font-normal tabular-nums text-muted-foreground">
          {tools.length}
        </span>
      </h2>
      <div className="mt-1">
        {tools.map((tool) => (
          <ToolLink key={tool.id} tool={tool} connected={connected} />
        ))}
      </div>
    </section>
  );
}

export function HomePage() {
  const isConnected = useSessionStore((s) => s.isConnected);
  const organization = useSessionStore((s) => s.organization);
  const selectedProject = useSessionStore((s) => s.selectedProject);
  const [variableGroups, ...otherGroups] = toolsByGroup();
  const offlineTool = TOOLS.find((t) => !t.requiresConnection);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
      {isConnected ? (
        <header className="mb-10">
          <h1 className="text-3xl font-semibold leading-tight">
            {selectedProject ? selectedProject.name : 'Pick a project to start'}
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            Connected to <span className="font-medium text-foreground">{organization}</span>.{' '}
            {selectedProject
              ? 'Every tool below reads from this project. Change it from the project menu at the top.'
              : 'Choose one from the project menu at the top, or open a tool and pick it there.'}
          </p>
        </header>
      ) : (
        <header className="mb-14 grid items-center gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
          <div>
            <h1 className="max-w-[20ch] text-[2rem] font-bold leading-[1.1] sm:text-[2.6rem]">
              Your Azure DevOps variables, compared and exported in seconds.
            </h1>
            <p className="mt-4 max-w-[54ch] leading-relaxed text-muted-foreground">
              Diff variable groups across environments, check them against App Service settings, and
              export to Excel. Runs in your browser. Your token stays in memory and is sent only to
              Azure DevOps.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/connect">
                  <PlugZap />
                  Connect to Azure DevOps
                </Link>
              </Button>
              {offlineTool && (
                <Button asChild size="lg" variant="ghost">
                  <Link to={offlineTool.path}>Try {offlineTool.title} without signing in</Link>
                </Button>
              )}
            </div>
          </div>
          <DiffSpecimen />
        </header>
      )}

      <div className="grid gap-x-14 gap-y-10 xl:grid-cols-2">
        {variableGroups && (
          <ToolGroup
            group={variableGroups.group}
            tools={variableGroups.tools}
            connected={isConnected}
          />
        )}
        <div className="space-y-10">
          {otherGroups.map(({ group, tools }) => (
            <ToolGroup key={group} group={group} tools={tools} connected={isConnected} />
          ))}
        </div>
      </div>
    </div>
  );
}
