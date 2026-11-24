import { useEffect, useState } from 'react';
import { LOCK_EXPIRY_MS } from '@/lib/utils/patVault';

export type LockLevel = 'off' | 'ok' | 'soon' | 'urgent' | 'expired';

export const SOON_MS = 10 * 60 * 1000;
export const URGENT_MS = 5 * 60 * 1000;

export function lockLevel(msLeft: number | null): LockLevel {
  if (msLeft === null) return 'off';
  if (msLeft <= 0) return 'expired';
  if (msLeft <= URGENT_MS) return 'urgent';
  if (msLeft <= SOON_MS) return 'soon';
  return 'ok';
}

/** How often the countdown needs to repaint at each level. */
export function tickInterval(level: LockLevel): number | null {
  switch (level) {
    case 'ok':
      return 60_000;
    case 'soon':
      return 15_000;
    case 'urgent':
      return 1_000;
    default:
      return null;
  }
}

export function msLeftFor(lockedAt: number | null, now = Date.now()): number | null {
  return lockedAt === null ? null : Math.max(0, LOCK_EXPIRY_MS - (now - lockedAt));
}

/** "24m" above five minutes, "4:07" below it. */
export function formatLockTime(msLeft: number): string {
  if (msLeft > URGENT_MS) return `${Math.ceil(msLeft / 60_000)}m`;
  const s = Math.ceil(msLeft / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Spoken form for screen readers: "4 minutes 12 seconds". */
export function speakLockTime(msLeft: number): string {
  const s = Math.ceil(msLeft / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (msLeft > URGENT_MS) return `${Math.ceil(msLeft / 60_000)} minutes`;
  return `${m} minute${m === 1 ? '' : 's'} ${sec} second${sec === 1 ? '' : 's'}`;
}

/**
 * Live countdown for a token lock. Repaints every minute while there's plenty
 * of time, every 15 s from ten minutes, and every second in the last five.
 */
export function useLockCountdown(lockedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  const msLeft = msLeftFor(lockedAt, now);
  const level = lockLevel(msLeft);

  useEffect(() => {
    setNow(Date.now());
  }, [lockedAt]);

  useEffect(() => {
    const every = tickInterval(level);
    if (every === null) return;
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [level]);

  return { msLeft, level };
}
