import { useState } from 'react';
import { ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { listProjects } from '@/lib/api/projects';
import { useSessionStore } from '@/store/sessionStore';
import { REQUIRED_PAT_SCOPES } from '@/lib/constants';
import { useCtrlEnter } from '@/lib/hooks/useHotkeys';

interface ConnectFormProps {
  title?: string;
  onConnected: () => void;
}

const ORG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

export function ConnectForm({ title = 'Connect to Azure DevOps', onConnected }: ConnectFormProps) {
  const connect = useSessionStore((s) => s.connect);
  const selectProject = useSessionStore((s) => s.selectProject);

  const [organization, setOrganization] = useState('');
  const [pat, setPat] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const org = organization.trim();
  const canSubmit = org.length > 0 && pat.trim().length > 0 && !validating;
  const tokenUrl = ORG_PATTERN.test(org)
    ? `https://dev.azure.com/${org}/_usersSettings/tokens`
    : 'https://dev.azure.com/_usersSettings/tokens';

  const handleConnect = async () => {
    if (!canSubmit) return;
    setValidating(true);
    setError(null);
    try {
      const projects = await listProjects(org, { patOverride: pat });
      connect(pat, org);
      if (projects.length === 1) selectProject(projects[0]!);
      onConnected();
    } catch (err) {
      setError(err);
    } finally {
      setValidating(false);
    }
  };

  useCtrlEnter(handleConnect, canSubmit);

  return (
    <div className="grid overflow-hidden rounded-xl border bg-card shadow-card md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
      {/* Form */}
      <form
        className="space-y-6 p-6 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          void handleConnect();
        }}
      >
        <div>
          <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Use your organization name and a Personal Access Token.
          </p>
        </div>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="org">Organization</Label>
            <div className="flex h-10 items-center rounded-md border border-input bg-background focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/40">
              <span className="select-none pl-3 font-mono text-sm text-muted-foreground">
                dev.azure.com/
              </span>
              <input
                id="org"
                placeholder="your-org"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="h-full min-w-0 flex-1 bg-transparent pr-3 font-mono text-sm placeholder:text-muted-foreground/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="pat">Personal Access Token</Label>
              <a
                href={tokenUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded text-xs font-medium underline decoration-border-strong underline-offset-[3px] transition-colors hover:decoration-foreground"
              >
                Create a token
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="relative">
              <Input
                id="pat"
                type={showPat ? 'text' : 'password'}
                placeholder="Paste your token"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="h-10 pr-10 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPat((s) => !s)}
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPat ? 'Hide token' : 'Show token'}
              >
                {showPat ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {error != null && <ErrorBanner error={error} />}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" size="lg" className="min-w-36" disabled={!canSubmit}>
            {validating && <Loader2 className="animate-spin" />}
            {validating ? 'Connecting…' : 'Connect'}
          </Button>
          <p className="text-xs text-muted-foreground">
            or press <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
          </p>
        </div>
      </form>

      {/* What the token needs, and where it goes */}
      <aside className="space-y-6 border-t bg-muted/40 p-6 text-sm sm:p-8 md:border-l md:border-t-0">
        <div>
          <h2 className="text-sm font-semibold">Token scopes</h2>
          <ul className="mt-3 space-y-3">
            {REQUIRED_PAT_SCOPES.map((scope) => (
              <li key={scope.name}>
                <p className="font-medium leading-snug">
                  {scope.name}
                  {!scope.required && (
                    <span className="ml-1.5 font-normal text-muted-foreground">(optional)</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {scope.detail}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Where your token goes</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            It stays in this tab’s memory and is sent only to Azure DevOps. Refreshing the page
            clears it, unless you choose to keep it encrypted for 30 minutes with the lock button.
          </p>
        </div>
      </aside>
    </div>
  );
}
