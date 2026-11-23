import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogOut, PlugZap, Search, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TOOLS, toolsByGroup } from '@/features/tools/registry';
import { unlockPat } from '@/lib/utils/patVault';
import { useSessionStore } from '@/store/sessionStore';
import { APP_VERSION, PORTFOLIO_URL } from '@/lib/constants';
import { cn } from '@/lib/utils/cn';
import { Logo } from './Logo';
import { PersistButton } from './PersistButton';
import { ThemeToggle } from './ThemeToggle';

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

/** "/" focuses the tool search from anywhere outside a text field. */
function useSlashFocus(ref: React.RefObject<HTMLInputElement>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
}

function ConnectionPanel({ onNavigate }: { onNavigate: () => void }) {
  const isConnected = useSessionStore((s) => s.isConnected);
  const organization = useSessionStore((s) => s.organization);
  const disconnect = useSessionStore((s) => s.disconnect);

  if (!isConnected) {
    return (
      <Link
        to="/connect"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-md border border-dashed border-primary/40 px-3 py-2.5 text-sm transition-colors hover:border-primary hover:bg-accent"
      >
        <PlugZap className="h-4 w-4 shrink-0 text-primary" />
        <span className="leading-tight">
          <span className="block font-medium">Connect to Azure DevOps</span>
          <span className="block text-xs text-muted-foreground">
            {TOOLS.filter((t) => t.requiresConnection).length} tools need a connection
          </span>
        </span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-background/40 py-1.5 pl-3 pr-1">
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="h-2 w-2 rounded-full bg-success" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium" title={organization ?? undefined}>
          {organization}
        </p>
        <p className="text-xs text-muted-foreground">Connected</p>
      </div>
      <PersistButton />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={async () => {
              await unlockPat().catch(() => {});
              disconnect();
            }}
            aria-label="Disconnect"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Disconnect and clear the token</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const [query, setQuery] = useState('');
  const isConnected = useSessionStore((s) => s.isConnected);
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchRef);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return toolsByGroup()
      .map(({ group, tools }) => ({
        group,
        tools: q
          ? tools.filter(
              (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
            )
          : tools,
      }))
      .filter((g) => g.tools.length > 0);
  }, [query]);

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:static lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex h-14 shrink-0 items-center px-5">
        <Logo />
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
            placeholder="Find a tool"
            aria-label="Find a tool"
            className="h-9 w-full rounded-md border border-sidebar-border bg-background/60 pl-8 pr-8 text-sm placeholder:text-muted-foreground/70 focus:border-primary/60 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">/</kbd>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto scrollbar-thin px-3 py-3">
        {groups.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No tool matches “{query}”.
          </p>
        )}
        {groups.map(({ group, tools }) => (
          <div key={group}>
            <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">{group}</p>
            <ul className="space-y-px">
              {tools.map((tool) => {
                const needsConnect = tool.requiresConnection && !isConnected;
                return (
                  <li key={tool.id}>
                    <NavLink
                      to={tool.path}
                      onClick={onNavigate}
                      title={tool.title}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2 py-[7px] text-sm transition-colors',
                          isActive
                            ? 'bg-accent font-medium text-accent-foreground shadow-[inset_2px_0_0_hsl(var(--primary))]'
                            : 'text-sidebar-foreground/80 hover:bg-foreground/[0.05] hover:text-sidebar-foreground',
                          needsConnect && !isActive && 'text-sidebar-foreground/55',
                        )
                      }
                    >
                      <tool.icon className="h-4 w-4 flex-shrink-0 opacity-80" />
                      <span className="flex-1 truncate">{tool.title}</span>
                      {!tool.requiresConnection && !isConnected && (
                        <span
                          className="rounded-sm border border-success-border bg-success-subtle px-1 text-2xs font-medium text-success"
                          title="Works without a connection"
                        >
                          offline
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-sidebar-border p-3">
        <ConnectionPanel onNavigate={onNavigate} />
        <div className="flex items-center justify-between gap-2 pl-1 text-xs text-muted-foreground">
          <a
            href={PORTFOLIO_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded hover:text-foreground"
          >
            v{APP_VERSION} on GitHub
          </a>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
