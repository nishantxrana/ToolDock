import { useLocation, useNavigate } from 'react-router-dom';
import { PanelLeft, RefreshCw, Search, Truck, Wrench } from 'lucide-react';
import { Segmented } from '@/components/ui/segmented';
import { MIGRATIONS, MIGRATE_HOME, isMigratePath } from '@/features/migrate/registry';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Logo } from './Logo';
import { ProjectSelector } from './ProjectSelector';
import { showCommandPalette } from '@/lib/commandPalette';
import { TOOLS } from '@/features/tools/registry';
import { useSessionStore } from '@/store/sessionStore';
import { useVariableGroups } from '@/lib/hooks/useVariableGroups';

interface HeaderProps {
  onToggleSidebar: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

type Mode = 'tools' | 'migrate';

/** Where each mode was last, so switching back returns to the same page. */
const lastPath: Record<Mode, string> = { tools: '/', migrate: MIGRATE_HOME };

/** Tools | Migrate pill. The mode comes from the URL, so there's nothing to keep in sync. */
function ModeSwitch({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return (
    <Segmented<Mode>
      label="Mode"
      value={mode}
      onChange={(next) => {
        if (next === mode) return;
        lastPath[mode] = pathname + search;
        navigate(lastPath[next]);
      }}
      options={[
        {
          value: 'tools',
          label: (
            <>
              <Wrench />
              Tools
            </>
          ),
        },
        {
          value: 'migrate',
          label: (
            <>
              <Truck />
              Migrate
            </>
          ),
        },
      ]}
    />
  );
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const isConnected = useSessionStore((s) => s.isConnected);
  const { isFetching: groupsFetching, refetch: refetchGroups } = useVariableGroups();
  const { pathname } = useLocation();
  const mode: Mode = isMigratePath(pathname) ? 'migrate' : 'tools';
  const migration = MIGRATIONS.find((m) => m.path === pathname);
  const tool = mode === 'tools' ? TOOLS.find((t) => t.path === pathname) : undefined;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-background/85 px-4 backdrop-blur-md sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="-ml-2 lg:hidden"
        onClick={onToggleSidebar}
        aria-label="Open tool list"
      >
        <PanelLeft />
      </Button>
      <div className="shrink-0 lg:hidden [&_span]:hidden sm:[&_span]:inline">
        <Logo />
      </div>

      <nav
        aria-label="Breadcrumb"
        className="hidden min-w-0 flex-1 items-center gap-2 whitespace-nowrap text-sm lg:flex"
      >
        {mode === 'migrate' ? (
          <>
            <span
              className={
                migration ? 'hidden text-muted-foreground xl:inline' : 'text-muted-foreground'
              }
            >
              Migrate
            </span>
            {migration && (
              <>
                <span className="hidden text-border-strong xl:inline" aria-hidden>
                  /
                </span>
                <span className="truncate font-medium">{migration.title}</span>
              </>
            )}
          </>
        ) : (
          <>
            <span
              className={tool ? 'hidden text-muted-foreground xl:inline' : 'text-muted-foreground'}
            >
              {tool ? tool.group : pathname === '/connect' ? 'Connection' : 'All tools'}
            </span>
            {tool && (
              <>
                <span className="hidden text-border-strong xl:inline" aria-hidden>
                  /
                </span>
                <span className="truncate font-medium">{tool.title}</span>
              </>
            )}
          </>
        )}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ModeSwitch mode={mode} />
        <button
          type="button"
          onClick={showCommandPalette}
          className="hidden h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-border bg-popover pl-2.5 pr-1.5 text-13 text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground md:inline-flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="pr-4 xl:pr-8">Go to tool</span>
          <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>
          <kbd>K</kbd>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={showCommandPalette}
          aria-label="Go to a tool"
        >
          <Search />
        </Button>

        {isConnected && mode === 'tools' && (
          <>
            <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
            <ProjectSelector />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => refetchGroups()}
                  disabled={groupsFetching}
                  aria-label="Reload variable groups"
                >
                  <RefreshCw className={groupsFetching ? 'animate-spin' : ''} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reload variable groups</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </header>
  );
}
