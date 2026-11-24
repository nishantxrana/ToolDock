import { LogOut } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LockTimer } from '@/components/common/LockTimer';
import { cn } from '@/lib/utils/cn';
import { useMigrationStore, type Side, type SourceConnection } from '@/store/migrationStore';
import { disconnectBoth, lockSide, unlockSide } from '../locks';

function name(conn: SourceConnection | null): string {
  if (!conn) return 'Not connected';
  if (conn.kind === 'jira') return `${conn.site}.atlassian.net`;
  return conn.project ? `${conn.organization} / ${conn.project.name}` : conn.organization;
}

function Row({ side, conn }: { side: Side; conn: SourceConnection | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          conn ? (side === 'target' ? 'bg-warning' : 'bg-success') : 'bg-border-strong',
        )}
        aria-hidden
      />
      <span className="w-12 shrink-0 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {side === 'source' ? 'From' : 'To'}
      </span>
      <span className={cn('truncate text-13', !conn && 'text-muted-foreground')} title={name(conn)}>
        {name(conn)}
      </span>
    </div>
  );
}

/** Sidebar footer in Migrate mode: both connections and the lock closest to expiring. */
export function MigrationConnectionsSummary() {
  const source = useMigrationStore((s) => s.source);
  const target = useMigrationStore((s) => s.target);
  const running = useMigrationStore((s) => s.running);

  const locked = (['source', 'target'] as const)
    .map((side) => ({ side, conn: side === 'source' ? source : target }))
    .filter((x) => x.conn?.lockedAt != null)
    .sort((a, b) => a.conn!.lockedAt! - b.conn!.lockedAt!);
  const soonest = locked[0];

  return (
    <div className="space-y-1.5 rounded-md border border-sidebar-border bg-background/40 px-3 py-2">
      <Row side="source" conn={source} />
      <Row side="target" conn={target} />
      {(source || target) && (
        <div className="flex items-center justify-between gap-2 pt-1">
          {soonest ? (
            <LockTimer
              subject={`${soonest.side} token`}
              lockedAt={soonest.conn!.lockedAt}
              migrationRunning={running}
              onLock={() => lockSide(soonest.side)}
              onUnlock={() => unlockSide(soonest.side)}
              onExpire={() => void unlockSide(soonest.side)}
            />
          ) : (
            <span className="text-xs text-muted-foreground">In memory only</span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={running}
                onClick={() => void disconnectBoth()}
                aria-label="Disconnect both sides"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-destructive-subtle hover:text-destructive disabled:opacity-40"
              >
                <LogOut className="h-3.5 w-3.5" />
                Disconnect
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {running ? 'Stop the migration first' : 'Clear both tokens from memory and storage'}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
