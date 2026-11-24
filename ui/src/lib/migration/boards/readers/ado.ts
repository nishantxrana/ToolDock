import {
  getNodeTree,
  getWorkItems,
  listComments,
  listFields,
  listWorkItemTypes,
  queryIds,
  type ClassificationNode,
  type WitField,
  type WorkItem,
} from '@/lib/api/migrate/wit';
import { adoLinks } from '@/lib/migration/links';
import type { AdoCredential } from '@/store/migrationStore';
import { sanitizeHtml } from '../html';
import type {
  LinkRel,
  NormalizedItem,
  PersonRef,
  SourceField,
  SourceNode,
  SourceSnapshot,
} from '../types';

/** System fields the writer sets itself, or that are computed and can't be written. */
const SKIP_FIELDS = new Set([
  'System.Id',
  'System.Rev',
  'System.Title',
  'System.State',
  'System.Reason',
  'System.WorkItemType',
  'System.AreaPath',
  'System.IterationPath',
  'System.AreaId',
  'System.IterationId',
  'System.TeamProject',
  'System.NodeName',
  'System.Tags',
  'System.History',
  'System.CreatedDate',
  'System.CreatedBy',
  'System.ChangedDate',
  'System.ChangedBy',
  'System.AuthorizedDate',
  'System.AuthorizedAs',
  'System.RevisedDate',
  'System.Watermark',
  'System.PersonId',
  'System.CommentCount',
  'System.Parent',
  'System.BoardColumn',
  'System.BoardColumnDone',
  'System.BoardLane',
  'System.ExternalLinkCount',
  'System.HyperLinkCount',
  'System.AttachedFileCount',
  'System.RelatedLinkCount',
  'System.RemoteLinkCount',
  'System.AreaLevel1',
  'Microsoft.VSTS.Common.StateChangeDate',
  'Microsoft.VSTS.Common.ActivatedDate',
  'Microsoft.VSTS.Common.ResolvedDate',
  'Microsoft.VSTS.Common.ClosedDate',
  'Microsoft.VSTS.Common.ActivatedBy',
  'Microsoft.VSTS.Common.ResolvedBy',
  'Microsoft.VSTS.Common.ClosedBy',
  'Microsoft.VSTS.Common.ResolvedReason',
]);

const skipField = (ref: string) =>
  SKIP_FIELDS.has(ref) ||
  /^System\.(AreaLevel|IterationLevel)\d+$/.test(ref) ||
  ref.startsWith('WEF_') ||
  ref.includes('_Kanban.Column');

function toNodes(node: ClassificationNode | undefined): SourceNode[] {
  return (node?.children ?? []).map((c) => ({
    name: c.name,
    startDate: c.attributes?.startDate,
    finishDate: c.attributes?.finishDate,
    children: toNodes(c),
  }));
}

const idFromUrl = (url: string) => url.split('/').pop() ?? '';

function person(v: unknown): PersonRef | undefined {
  if (!v) return undefined;
  if (typeof v === 'string') {
    const m = /^(.*?)\s*<([^>]+)>$/.exec(v);
    return m ? { displayName: m[1]!, uniqueName: m[2] } : { displayName: v };
  }
  const o = v as { displayName?: string; uniqueName?: string };
  return o.displayName ? { displayName: o.displayName, uniqueName: o.uniqueName } : undefined;
}

export function normalizeAdoItem(
  wi: WorkItem,
  fieldDefs: Map<string, WitField>,
  stateCategory: (type: string, state: string) => string | undefined,
  org: string,
  project: string,
): NormalizedItem {
  const f = wi.fields;
  const type = String(f['System.WorkItemType'] ?? '');
  const state = String(f['System.State'] ?? '');
  const item: NormalizedItem = {
    sourceKey: String(wi.id),
    sourceUrl: adoLinks.workItem(org, project, wi.id),
    type,
    title: String(f['System.Title'] ?? ''),
    state,
    stateCategory: stateCategory(type, state),
    fields: {},
    html: {},
    areaPath: String(f['System.AreaPath'] ?? '')
      .split('\\')
      .slice(1)
      .filter(Boolean),
    iterationPath: String(f['System.IterationPath'] ?? '')
      .split('\\')
      .slice(1)
      .filter(Boolean),
    createdAt: f['System.CreatedDate'] as string | undefined,
    createdBy:
      person(f['System.CreatedBy'])?.uniqueName ?? person(f['System.CreatedBy'])?.displayName,
    changedAt: f['System.ChangedDate'] as string | undefined,
    people: {},
    tags: String(f['System.Tags'] ?? '')
      .split(';')
      .map((t) => t.trim())
      .filter(Boolean),
    attachments: [],
    links: [],
    hyperlinks: [],
    unsupportedLinks: 0,
  };

  for (const [ref, value] of Object.entries(f)) {
    if (skipField(ref) || value === null || value === undefined || value === '') continue;
    const def = fieldDefs.get(ref);
    if (
      def?.isIdentity ||
      (typeof value === 'object' && value && 'uniqueName' in (value as object))
    ) {
      const p = person(value);
      if (p) item.people[ref] = p;
    } else if (def?.type === 'html') {
      item.html[ref] = sanitizeHtml(String(value));
    } else if (def?.type !== 'treePath') {
      item.fields[ref] = value;
    }
  }

  const id = wi.id;
  for (const r of wi.relations ?? []) {
    const rel = r.rel;
    if (rel === 'AttachedFile') {
      item.attachments.push({
        name: String(r.attributes?.name ?? 'attachment'),
        url: r.url,
        size: Number(r.attributes?.resourceSize) || undefined,
      });
    } else if (rel === 'Hyperlink') {
      item.hyperlinks.push(r.url);
    } else if (
      rel === 'System.LinkTypes.Hierarchy-Reverse' ||
      rel === 'System.LinkTypes.Dependency-Forward' ||
      rel === 'System.LinkTypes.Duplicate-Forward'
    ) {
      item.links.push({ rel: rel as LinkRel, targetKey: idFromUrl(r.url) });
    } else if (rel === 'System.LinkTypes.Related') {
      // Related links are symmetrical: keep each pair once, from the lower id.
      const other = idFromUrl(r.url);
      if (Number(other) > id)
        item.links.push({ rel: 'System.LinkTypes.Related', targetKey: other });
    } else if (
      rel === 'System.LinkTypes.Hierarchy-Forward' ||
      rel === 'System.LinkTypes.Dependency-Reverse' ||
      rel === 'System.LinkTypes.Duplicate-Reverse'
    ) {
      // The other end carries this link in canonical direction.
    } else {
      item.unsupportedLinks++;
    }
  }
  return item;
}

export async function readAdoSnapshot(
  cred: AdoCredential,
  project: { id: string; name: string },
  wiql: string,
  onProgress: (label: string, pct: number) => void,
  signal?: AbortSignal,
): Promise<SourceSnapshot> {
  onProgress('Running the query', 5);
  const ids = await queryIds(cred, project.name, wiql, signal);
  onProgress(`Reading ${ids.length} work items`, 15);
  const [types, fields, areas, iterations] = await Promise.all([
    listWorkItemTypes(cred, project.name),
    listFields(cred, project.name),
    getNodeTree(cred, project.name, 'Areas').catch(() => undefined),
    getNodeTree(cred, project.name, 'Iterations').catch(() => undefined),
  ]);
  const items: WorkItem[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    items.push(...(await getWorkItems(cred, ids.slice(i, i + 200), signal)));
    onProgress(
      `Read ${Math.min(ids.length, i + 200)} of ${ids.length} work items`,
      15 + (75 * Math.min(ids.length, i + 200)) / Math.max(1, ids.length),
    );
  }
  const fieldDefs = new Map(fields.map((x) => [x.referenceName, x]));
  const categories = new Map<string, string>();
  for (const t of types)
    for (const s of t.states ?? []) categories.set(`${t.name}|${s.name}`, s.category);
  const normalized = items.map((wi) =>
    normalizeAdoItem(
      wi,
      fieldDefs,
      (t, s) => categories.get(`${t}|${s}`),
      cred.organization,
      project.name,
    ),
  );

  // Only fields that actually carry values in the chosen items.
  const used = new Map<string, SourceField>();
  const people = new Map<string, PersonRef>();
  for (const it of normalized) {
    for (const key of [
      ...Object.keys(it.fields),
      ...Object.keys(it.html),
      ...Object.keys(it.people),
    ]) {
      const def = fieldDefs.get(key);
      if (!used.has(key))
        used.set(key, {
          key,
          name: def?.name ?? key,
          type: def?.isIdentity ? 'identity' : (def?.type ?? 'string'),
        });
    }
    for (const p of Object.values(it.people))
      people.set((p.uniqueName ?? p.displayName).toLowerCase(), p);
  }
  const usedTypes = new Set(normalized.map((i) => i.type));
  onProgress('Done', 100);
  return {
    items: normalized,
    types: types
      .filter((t) => usedTypes.has(t.name))
      .map((t) => ({
        name: t.name,
        states: (t.states ?? []).map((s) => ({ name: s.name, category: s.category })),
      })),
    fields: [...used.values()].sort((a, b) => a.name.localeCompare(b.name)),
    areas: toNodes(areas),
    iterations: toNodes(iterations),
    people: [...people.values()],
  };
}

export async function readAdoComments(cred: AdoCredential, project: string, item: NormalizedItem) {
  const comments = await listComments(cred, project, Number(item.sourceKey));
  return comments.map((c) => ({
    author: c.createdBy?.displayName ?? 'Someone',
    date: c.createdDate ?? '',
    html: sanitizeHtml(c.text ?? ''),
  }));
}
