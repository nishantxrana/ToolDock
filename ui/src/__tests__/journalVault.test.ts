import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addReportItems,
  deleteJob,
  endpointInfo,
  getItems,
  getJob,
  getReportItems,
  idMap,
  listJobs,
  putItems,
  saveJob,
  type Job,
} from '@/lib/migration/journal';
import {
  LOCK_EXPIRY_MS,
  loadLockedPat,
  loadLockedSecret,
  lockPat,
  lockSecret,
  unlockSecret,
} from '@/lib/utils/patVault';

const job = (id: string, settings: Record<string, unknown> = {}): Job => ({
  id,
  type: 'repos',
  title: 'Repos',
  source: { kind: 'ado', organization: 'a', projectId: 'p1', projectName: 'P1' },
  target: { kind: 'ado', organization: 'b', projectId: 'p2', projectName: 'P2' },
  settings,
  status: 'draft',
  createdAt: 1,
  updatedAt: 1,
});

describe('migration journal', () => {
  beforeEach(async () => {
    for (const j of await listJobs()) await deleteJob(j.id);
  });

  it('stores jobs, items and report items, and builds ID maps', async () => {
    await saveJob(job('j1', { selected: ['r1'] }));
    await putItems([
      { jobId: 'j1', kind: 'repo', sourceId: 'r1', targetId: 't1', status: 'ok' },
      { jobId: 'j1', kind: 'repo', sourceId: 'r2', status: 'failed', message: 'x' },
      { jobId: 'j1', kind: 'repo', sourceId: 'r3', targetId: 't3', status: 'warning' },
    ]);
    await addReportItems('j1', [
      { area: 'Repos', severity: 'info', title: 'PRs', detail: 'not copied' },
    ]);
    expect((await getJob('j1'))?.settings).toEqual({ selected: ['r1'] });
    expect(await getItems('j1')).toHaveLength(3);
    expect([...(await idMap('j1', 'repo'))]).toEqual([
      ['r1', 't1'],
      ['r3', 't3'],
    ]);
    expect(await getReportItems('j1')).toEqual([
      { area: 'Repos', severity: 'info', title: 'PRs', detail: 'not copied' },
    ]);
  });

  it('a re-run overwrites an item instead of duplicating it', async () => {
    await saveJob(job('j2'));
    await putItems([{ jobId: 'j2', kind: 'group', sourceId: '7', status: 'failed' }]);
    await putItems([{ jobId: 'j2', kind: 'group', sourceId: '7', targetId: '70', status: 'ok' }]);
    const items = await getItems('j2');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: 'ok', targetId: '70' });
  });

  it('deleting a job removes its items and report', async () => {
    await saveJob(job('j3'));
    await putItems([{ jobId: 'j3', kind: 'repo', sourceId: 'x', status: 'ok' }]);
    await addReportItems('j3', [{ area: 'Repos', severity: 'info', title: 't', detail: 'd' }]);
    await deleteJob('j3');
    expect(await getJob('j3')).toBeUndefined();
    expect(await getItems('j3')).toEqual([]);
    expect(await getReportItems('j3')).toEqual([]);
  });

  it('never stores tokens', async () => {
    await expect(saveJob(job('j4', { pat: 'secret-value' }))).rejects.toThrow(
      /never stores credentials/,
    );
    await expect(saveJob(job('j5', { nested: { token: 'abc' } }))).rejects.toThrow(
      /never stores credentials/,
    );
    // Option names that merely mention secrets are fine.
    await expect(saveJob(job('j6', { secretMode: 'placeholder' }))).resolves.toBeUndefined();
    expect(
      endpointInfo({ kind: 'ado', organization: 'o', project: { id: '1', name: 'P' } }),
    ).toEqual({
      kind: 'ado',
      organization: 'o',
      projectId: '1',
      projectName: 'P',
    });
  });
});

describe('token vault slots', () => {
  beforeEach(async () => {
    for (const s of ['tools', 'mig-source', 'mig-target', 'mig-jira'] as const)
      await unlockSecret(s);
    vi.useRealTimers();
  });

  it('keeps slots apart', async () => {
    await lockSecret('mig-source', 'src-pat', { organization: 'a' });
    await lockSecret('mig-target', 'tgt-pat', { organization: 'b' });
    await unlockSecret('mig-target');
    expect((await loadLockedSecret('mig-source'))?.secret).toBe('src-pat');
    expect(await loadLockedSecret('mig-target')).toBeNull();
  });

  it('wipes a slot once its 30 minutes are up', async () => {
    const now = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    await lockSecret('mig-target', 'tgt-pat', { organization: 'b' });
    vi.setSystemTime(now + LOCK_EXPIRY_MS + 1000);
    expect(await loadLockedSecret('mig-target')).toBeNull();
    vi.setSystemTime(now);
    expect(await loadLockedSecret('mig-target')).toBeNull();
  });

  it("still loads a PAT saved by the Tools mode (the record ids didn't change)", async () => {
    await lockPat('tools-pat', 'contoso');
    expect(await loadLockedPat()).toMatchObject({ pat: 'tools-pat', organization: 'contoso' });
    expect(await loadLockedSecret('mig-source')).toBeNull();
  });

  it('only stores ciphertext', async () => {
    await lockSecret('mig-source', 'plain-text-pat', { organization: 'a' });
    const raw = await new Promise<unknown>((resolve) => {
      const req = indexedDB.open('tooldock-vault', 1);
      req.onsuccess = () => {
        const get = req.result.transaction('vault').objectStore('vault').get('mig-source:secret');
        get.onsuccess = () => resolve(get.result);
      };
    });
    expect(JSON.stringify(raw)).not.toContain('plain-text-pat');
  });
});
