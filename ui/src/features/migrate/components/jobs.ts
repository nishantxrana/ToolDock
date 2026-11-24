import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { endpointInfo, getJob, newJobId, saveJob, type Job } from '@/lib/migration/journal';
import { useMigrationStore } from '@/store/migrationStore';
import type { MigrationDefinition } from '../registry';

/** The job named in ?job=…, for resuming or reopening a report. undefined while loading. */
export function useJobParam(): Job | null | undefined {
  const [params] = useSearchParams();
  const id = params.get('job');
  const [job, setJob] = useState<Job | null | undefined>(id ? undefined : null);
  useEffect(() => {
    if (!id) {
      setJob(null);
      return;
    }
    let cancelled = false;
    getJob(id)
      .then((j) => !cancelled && setJob(j ?? null))
      .catch(() => !cancelled && setJob(null));
    return () => {
      cancelled = true;
    };
  }, [id]);
  return job;
}

/** Create (or update, when resuming) the job for this run. Never stores tokens. */
export async function prepareJob(
  def: MigrationDefinition,
  title: string,
  settings: Record<string, unknown>,
  existing?: Job | null,
): Promise<Job> {
  const { source, target } = useMigrationStore.getState();
  if (!source || !target) throw new Error('Connect both sides first.');
  const sourceInfo = endpointInfo(
    source.kind === 'jira' ? { kind: 'jira', site: source.site } : source,
  );
  const targetInfo = endpointInfo(target);
  // Only continue an earlier job when it's the same migration between the same
  // places; otherwise its journal would skip items that were copied elsewhere.
  const same = (a: Job['source'], b: Job['source']) =>
    a.kind === b.kind &&
    (a.organization ?? '').toLowerCase() === (b.organization ?? '').toLowerCase() &&
    (a.projectId ?? '') === (b.projectId ?? '') &&
    (a.site ?? '') === (b.site ?? '');
  const reuse =
    existing &&
    existing.type === def.id &&
    same(existing.source, sourceInfo) &&
    same(existing.target, targetInfo)
      ? existing
      : null;
  const job: Job = {
    id: reuse?.id ?? newJobId(),
    type: def.id,
    title,
    source: sourceInfo,
    target: targetInfo,
    settings,
    status: 'draft',
    createdAt: reuse?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  await saveJob(job);
  return job;
}

/** Readable "org / project" for both sides, for report headers. */
export function sideLabels(): { source: string; target: string } {
  const { source, target } = useMigrationStore.getState();
  const s = !source
    ? '?'
    : source.kind === 'jira'
      ? `${source.site}.atlassian.net`
      : `${source.organization} / ${source.project?.name ?? '?'}`;
  const t = target ? `${target.organization} / ${target.project?.name ?? '?'}` : '?';
  return { source: s, target: t };
}

/** True when both sides are connected and have a project (Jira picks its project later). */
export function useConnectionsReady(sourceKind: 'ado' | 'jira'): boolean {
  const source = useMigrationStore((s) => s.source);
  const target = useMigrationStore((s) => s.target);
  if (!source || !target || !target.project || source.kind !== sourceKind) return false;
  if (source.kind === 'ado') {
    if (!source.project) return false;
    const same =
      source.organization.toLowerCase() === target.organization.toLowerCase() &&
      source.project.id === target.project.id;
    return !same;
  }
  return true;
}
