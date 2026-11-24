import { useEffect, useRef } from 'react';
import { Lock, LockOpen, TimerReset } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  formatLockTime,
  speakLockTime,
  useLockCountdown,
  type LockLevel,
} from '@/lib/hooks/useLockCountdown';
import { LOCK_EXPIRY_MS } from '@/lib/utils/patVault';
import { cn } from '@/lib/utils/cn';

interface LockTimerProps {
  /** When the lock was taken; null while the token is in memory only. */
  lockedAt: number | null;
  /** What is locked, for labels and alerts, e.g. "PAT" or "Target token". */
  subject: string;
  busy?: boolean;
  /** Lock (or re-lock to extend) for another 30 minutes. */
  onLock: () => void | Promise<void>;
  /** Remove the saved copy; the in-memory token stays. */
  onUnlock: () => void | Promise<void>;
  /** The timer ran out; the caller clears the saved copy and its state. */
  onExpire: () => void;
  /** Adds a nudge to the five-minute alert while a migration is running. */
  migrationRunning?: boolean;
}

const LEVEL_STYLE: Record<LockLevel, string> = {
  off: 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
  ok: 'bg-success-subtle text-success hover:bg-success-subtle',
  soon: 'bg-warning-subtle text-warning hover:bg-warning-subtle',
  urgent:
    'bg-destructive-subtle text-destructive hover:bg-destructive-subtle motion-safe:animate-lock-pulse',
  expired: 'text-muted-foreground',
};

/** Thin ring around the lock icon showing the share of the 30 minutes left. */
function Ring({ fraction }: { fraction: number }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 26 26" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
      <circle
        cx="13"
        cy="13"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.18}
        strokeWidth={2}
      />
      <circle
        cx="13"
        cy="13"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        className="transition-[stroke-dashoffset] duration-700 ease-out"
      />
    </svg>
  );
}

/**
 * Token lock button with a colour-coded countdown: green with plenty of time,
 * amber from ten minutes, red (pulsing, m:ss) in the last five. Alerts with an
 * Extend action fire once at five minutes and once at one minute.
 */
export function LockTimer({
  lockedAt,
  subject,
  busy,
  onLock,
  onUnlock,
  onExpire,
  migrationRunning,
}: LockTimerProps) {
  const { msLeft, level } = useLockCountdown(lockedAt);
  const fired = useRef(new Set<string>());
  const locked = lockedAt !== null;

  // Keep the latest callbacks without re-running the alert effect.
  const latest = useRef({ onLock, onExpire, migrationRunning, subject });
  latest.current = { onLock, onExpire, migrationRunning, subject };

  useEffect(() => {
    if (lockedAt === null || msLeft === null) return;
    const {
      onLock: extend,
      onExpire: expire,
      migrationRunning: running,
      subject: what,
    } = latest.current;
    const once = (tag: string) => {
      const key = `${lockedAt}:${tag}`;
      if (fired.current.has(key)) return false;
      fired.current.add(key);
      return true;
    };
    const extendAction = { label: 'Extend 30 min', onClick: () => void extend() };

    if (level === 'expired') {
      if (once('expired')) {
        expire();
        toast.info(`Saved ${what} cleared`, {
          id: `lock-${what}`,
          description: 'It still works until you reload or close this tab.',
        });
      }
      return;
    }
    if (msLeft <= 60_000) {
      if (once('1m')) {
        toast.error(`Saved ${what} clears in 1 minute`, {
          id: `lock-${what}`,
          description: 'Extend it to keep it through a refresh.',
          action: extendAction,
          duration: 20_000,
        });
      }
      return;
    }
    if (level === 'urgent' && once('5m')) {
      toast.warning(`Saved ${what} clears in under 5 minutes`, {
        id: `lock-${what}`,
        description: running
          ? "A migration is running. Extend so a refresh doesn't stop it."
          : 'Extend it to keep it through a refresh.',
        action: extendAction,
        duration: 15_000,
      });
    }
  }, [lockedAt, msLeft, level]);

  const label = !locked
    ? `${subject} in memory only. Lock to keep it through a refresh for 30 minutes.`
    : `${subject} locked, ${speakLockTime(msLeft ?? 0)} left. Click to remove the saved copy.`;
  const showExtend = locked && (level === 'soon' || level === 'urgent');

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => void (locked ? onUnlock() : onLock())}
            disabled={busy}
            aria-label={label}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1 rounded-md pl-1 pr-1.5 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
              !locked && 'w-8 justify-center px-0',
              LEVEL_STYLE[locked ? level : 'off'],
            )}
          >
            <span className="relative flex h-[26px] w-[26px] items-center justify-center">
              {locked && msLeft !== null && <Ring fraction={msLeft / LOCK_EXPIRY_MS} />}
              {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-4 w-4" />}
            </span>
            {locked && msLeft !== null && <span aria-hidden>{formatLockTime(msLeft)}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64">
          {locked
            ? `Saved encrypted for ${speakLockTime(msLeft ?? 0)} more. Click to remove the saved copy.`
            : 'In memory only. Lock to keep it through a refresh for 30 min.'}
        </TooltipContent>
      </Tooltip>
      {showExtend && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => void onLock()}
              disabled={busy}
              aria-label={`Extend the ${subject} lock by 30 minutes`}
              className={cn(
                'inline-flex h-8 w-7 items-center justify-center rounded-md transition-colors hover:bg-foreground/[0.06]',
                level === 'urgent' ? 'text-destructive' : 'text-warning',
              )}
            >
              <TimerReset className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Extend 30 min</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
