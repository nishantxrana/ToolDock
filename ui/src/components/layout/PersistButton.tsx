import { useState } from 'react';
import { toast } from 'sonner';
import { LockTimer } from '@/components/common/LockTimer';
import { lockPat, unlockPat } from '@/lib/utils/patVault';
import { useSessionStore } from '@/store/sessionStore';

/** Tools-mode PAT lock: optionally keeps the PAT encrypted through a refresh. */
export function PersistButton() {
  const pat = useSessionStore((s) => s.pat);
  const organization = useSessionStore((s) => s.organization);
  const lockedAt = useSessionStore((s) => s.lockedAt);
  const setPatPersisted = useSessionStore((s) => s.setPatPersisted);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch {
      toast.error('Storage unavailable', {
        description: 'Encrypted storage is not available in this browser or mode.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <LockTimer
      subject="PAT"
      lockedAt={lockedAt}
      busy={busy}
      onLock={() =>
        run(async () => {
          if (!pat || !organization) return;
          const { lockedAt: at } = await lockPat(pat, organization);
          setPatPersisted(true, at);
        })
      }
      onUnlock={() =>
        run(async () => {
          await unlockPat();
          setPatPersisted(false, null);
        })
      }
      onExpire={() => {
        void unlockPat();
        setPatPersisted(false, null);
      }}
    />
  );
}
