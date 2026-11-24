/**
 * Migration journal in IndexedDB: jobs, per-item results (which double as the
 * source → target ID maps) and report items. It makes a run resumable after a
 * refresh and safe to re-run, since items already marked ok are skipped.
 *
 * It NEVER stores tokens: job endpoints are reduced to organization, project
 * and Jira site by `endpointInfo` before anything is written.
 */

import type { ReportItem } from './report';

const DB_NAME = 'tooldock-migrations';
const DB_VERSION = 1;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type MigrationType = 'variable-groups' | 'repos' | 'pipelines' | 'boards' | 'jira';
export type JobStatus = 'draft' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled';

export interface EndpointInfo {
  kind: 'ado' | 'jira';
  organization?: string;
  projectId?: string;
  projectName?: string;
  site?: string;
}

export interface Job {
  id: string;
  type: MigrationType;
  title: string;
  source: EndpointInfo;
  target: EndpointInfo;
  /** Options and mappings chosen in the wizard (never credentials). */
  settings: Record<string, unknown>;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  counts?: { ok: number; skipped: number; warning: number; failed: number };
}

export type ItemStatus = 'ok' | 'skipped' | 'warning' | 'failed';

export interface JobItem {
  jobId: string;
  /** e.g. 'group', 'repo', 'taskgroup', 'build', 'release', 'workitem', 'area', 'iteration', 'links' */
  kind: string;
  sourceId: string;
  targetId?: string;
  label?: string;
  status: ItemStatus;
  message?: string;
  updatedAt: number;
}

/** Reduce a connection to what may be stored: no tokens, ever. */
export function endpointInfo(conn: {
  kind: 'ado' | 'jira';
  organization?: string;
  project?: { id: string; name: string } | null;
  site?: string;
}): EndpointInfo {
  return conn.kind === 'jira'
    ? { kind: 'jira', site: conn.site }
    : {
        kind: 'ado',
        organization: conn.organization,
        projectId: conn.project?.id,
        projectName: conn.project?.name,
      };
}

const SECRET_KEY = /^(pat|token|password|apiToken|accessToken|authorization)$/i;

/** Defence in depth: refuse to write a job whose settings carry a credential-looking field. */
function assertNoSecrets(value: unknown, path = 'settings'): void {
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(k) && typeof v === 'string' && v.length > 0) {
      throw new Error(`Refusing to save "${path}.${k}": the journal never stores credentials.`);
    }
    assertNoSecrets(v, `${path}.${k}`);
  }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('jobs', { keyPath: 'id' });
      const items = db.createObjectStore('items', { keyPath: ['jobId', 'kind', 'sourceId'] });
      items.createIndex('jobId', 'jobId');
      const report = db.createObjectStore('report', { keyPath: 'seq', autoIncrement: true });
      report.createIndex('jobId', 'jobId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  work: (t: IDBTransaction) => IDBRequest<T> | void,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(stores, mode);
        const req = work(t);
        let result: T;
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => {
          db.close();
          resolve(result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
        t.onabort = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

export function newJobId(): string {
  return `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36)}`;
}

export async function saveJob(job: Job): Promise<void> {
  assertNoSecrets(job.settings);
  assertNoSecrets(job.source, 'source');
  assertNoSecrets(job.target, 'target');
  await tx('jobs', 'readwrite', (t) =>
    t.objectStore('jobs').put({ ...job, updatedAt: Date.now() }),
  );
}

export async function updateJob(id: string, patch: Partial<Omit<Job, 'id'>>): Promise<void> {
  const job = await getJob(id);
  if (job) await saveJob({ ...job, ...patch });
}

export function getJob(id: string): Promise<Job | undefined> {
  return tx<Job | undefined>('jobs', 'readonly', (t) => t.objectStore('jobs').get(id));
}

export async function listJobs(): Promise<Job[]> {
  const jobs = await tx<Job[]>('jobs', 'readonly', (t) => t.objectStore('jobs').getAll());
  return jobs.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putItems(items: Omit<JobItem, 'updatedAt'>[]): Promise<void> {
  if (items.length === 0) return;
  await tx('items', 'readwrite', (t) => {
    const store = t.objectStore('items');
    for (const item of items) store.put({ ...item, updatedAt: Date.now() });
  });
}

export function putItem(item: Omit<JobItem, 'updatedAt'>): Promise<void> {
  return putItems([item]);
}

export function getItems(jobId: string): Promise<JobItem[]> {
  return tx<JobItem[]>('items', 'readonly', (t) =>
    t.objectStore('items').index('jobId').getAll(jobId),
  );
}

/** sourceId → targetId for one kind, from items that finished ok (or with a warning). */
export async function idMap(jobId: string, kind: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const item of await getItems(jobId)) {
    if (
      item.kind === kind &&
      item.targetId &&
      (item.status === 'ok' || item.status === 'warning')
    ) {
      map.set(item.sourceId, item.targetId);
    }
  }
  return map;
}

export async function addReportItems(jobId: string, items: ReportItem[]): Promise<void> {
  if (items.length === 0) return;
  await tx('report', 'readwrite', (t) => {
    const store = t.objectStore('report');
    for (const item of items) store.add({ ...item, jobId });
  });
}

export async function getReportItems(jobId: string): Promise<ReportItem[]> {
  const rows = await tx<(ReportItem & { jobId: string; seq: number })[]>(
    'report',
    'readonly',
    (t) => t.objectStore('report').index('jobId').getAll(jobId),
  );
  return rows.sort((a, b) => a.seq - b.seq).map(({ jobId: _j, seq: _s, ...item }) => item);
}

/** Remove report items for a job (before a re-run regenerates them). */
export async function clearReport(jobId: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction('report', 'readwrite');
    const req = t.objectStore('report').index('jobId').openCursor(IDBKeyRange.only(jobId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  db.close();
}

export async function deleteJob(jobId: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(['jobs', 'items', 'report'], 'readwrite');
    t.objectStore('jobs').delete(jobId);
    for (const name of ['items', 'report']) {
      const req = t.objectStore(name).index('jobId').openCursor(IDBKeyRange.only(jobId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  db.close();
}

/** Drop jobs older than 30 days. Safe to call on every visit. */
export async function pruneOldJobs(): Promise<void> {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const job of await listJobs()) {
    if (job.updatedAt < cutoff) await deleteJob(job.id);
  }
}
