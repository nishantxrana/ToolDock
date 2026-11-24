import { toast } from 'sonner';
import { lockSecret, loadLockedSecret, unlockSecret, type VaultSlot } from '@/lib/utils/patVault';
import { useMigrationStore, type Side } from '@/store/migrationStore';

/** Vault slot for each side. A Jira source has its own slot. */
function slotFor(side: Side, kind: 'ado' | 'jira'): VaultSlot {
  if (side === 'target') return 'mig-target';
  return kind === 'jira' ? 'mig-jira' : 'mig-source';
}

/** Lock (or re-lock, which extends) one side's connection for 30 minutes. */
export async function lockSide(side: Side): Promise<void> {
  const conn = useMigrationStore.getState()[side];
  if (!conn) return;
  try {
    const { lockedAt } =
      conn.kind === 'jira'
        ? await lockSecret('mig-jira', JSON.stringify({ email: conn.email, token: conn.token }), {
            site: conn.site,
            displayName: conn.displayName ?? '',
          })
        : await lockSecret(slotFor(side, 'ado'), conn.pat, {
            organization: conn.organization,
            projectId: conn.project?.id ?? '',
            projectName: conn.project?.name ?? '',
          });
    useMigrationStore.getState().setLockedAt(side, lockedAt);
  } catch {
    toast.error('Storage unavailable', {
      description: 'Encrypted storage is not available in this browser or mode.',
    });
  }
}

/** Remove one side's saved copy. The in-memory connection stays. */
export async function unlockSide(side: Side): Promise<void> {
  const conn = useMigrationStore.getState()[side];
  await unlockSecret(slotFor(side, conn?.kind ?? 'ado'));
  if (side === 'source') await unlockSecret('mig-jira');
  useMigrationStore.getState().setLockedAt(side, null);
}

/** Disconnect one side: clears memory and its saved copy. */
export async function disconnectSide(side: Side): Promise<void> {
  await unlockSide(side);
  useMigrationStore.getState().clear(side);
}

export async function disconnectBoth(): Promise<void> {
  await Promise.all([
    unlockSecret('mig-source'),
    unlockSecret('mig-jira'),
    unlockSecret('mig-target'),
  ]);
  useMigrationStore.getState().clearAll();
}

/**
 * On page load, bring back any migration connection whose 30-minute lock
 * hasn't expired. Projects are re-listed by the connection card.
 */
export async function restoreMigrationLocks(): Promise<void> {
  const store = useMigrationStore.getState();
  const project = (meta: Record<string, string>) =>
    meta.projectId ? { id: meta.projectId, name: meta.projectName ?? '' } : null;

  try {
    const src = await loadLockedSecret('mig-source');
    if (src && src.meta.organization) {
      store.setSource({
        kind: 'ado',
        organization: src.meta.organization,
        pat: src.secret,
        projects: [],
        project: project(src.meta),
        lockedAt: src.lockedAt,
        restored: true,
      });
    } else {
      const j = await loadLockedSecret('mig-jira');
      if (j && j.meta.site) {
        const { email, token } = JSON.parse(j.secret) as { email: string; token: string };
        store.setSource({
          kind: 'jira',
          site: j.meta.site,
          email,
          token,
          displayName: j.meta.displayName || undefined,
          lockedAt: j.lockedAt,
          restored: true,
        });
      }
    }
    const tgt = await loadLockedSecret('mig-target');
    if (tgt && tgt.meta.organization) {
      store.setTarget({
        kind: 'ado',
        organization: tgt.meta.organization,
        pat: tgt.secret,
        projects: [],
        project: project(tgt.meta),
        lockedAt: tgt.lockedAt,
        restored: true,
      });
    }
  } catch {
    // IndexedDB unavailable or a record is unreadable: start disconnected.
  }
}
