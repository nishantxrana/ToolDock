import {
  getJiraProject,
  listJiraComments,
  listJiraFields,
  listJiraSprints,
  listJiraStatuses,
  searchIssues,
  type JiraField,
  type JiraIssue,
} from '@/lib/api/migrate/jira';
import { jiraLinks } from '@/lib/migration/links';
import type { JiraCredential } from '@/store/migrationStore';
import { sanitizeHtml } from '../html';
import { JIRA_CATEGORY } from '../mapping';
import type { LinkRel, NormalizedItem, PersonRef, SourceField, SourceSnapshot } from '../types';

/** Fields read into dedicated slots (or never copied). */
const HANDLED = new Set([
  'summary',
  'description',
  'status',
  'issuetype',
  'project',
  'created',
  'creator',
  'reporter',
  'assignee',
  'updated',
  'labels',
  'components',
  'attachment',
  'issuelinks',
  'subtasks',
  'parent',
  'comment',
  'worklog',
  'watches',
  'votes',
  'lastViewed',
  'statuscategorychangedate',
  'statusCategory',
  'progress',
  'aggregateprogress',
  'thumbnail',
  'workratio',
  'timetracking',
  'aggregatetimespent',
  'aggregatetimeestimate',
  'aggregatetimeoriginalestimate',
  'timespent',
  'issuerestriction',
  'environment',
  'security',
  'rankBeforeIssue',
]);

const SPRINT = 'com.pyxis.greenhopper.jira:gh-sprint';
const EPIC_LINK = 'com.pyxis.greenhopper.jira:gh-epic-link';
const RANK = 'com.pyxis.greenhopper.jira:gh-lexo-rank';

function person(v: unknown): PersonRef | undefined {
  const o = v as { displayName?: string; emailAddress?: string } | null;
  return o?.displayName ? { displayName: o.displayName, uniqueName: o.emailAddress } : undefined;
}

function jiraType(f: JiraField): string {
  const t = f.schema?.type ?? 'string';
  if (t === 'number') return 'double';
  if (t === 'datetime' || t === 'date') return 'dateTime';
  if (t === 'user') return 'identity';
  return 'string';
}

/**
 * Make links in Jira's rendered HTML absolute, and point attachment images at
 * the REST content URL (the only Jira path the proxy serves).
 */
export function absolutizeJiraHtml(html: string, site: string): string {
  const base = `https://${site}.atlassian.net`;
  return html
    .replace(
      /(src|href)="\/secure\/(?:attachment|thumbnail)\/(\d+)\/[^"]*"/g,
      (_m, attr: string, id: string) => `${attr}="${base}/rest/api/3/attachment/content/${id}"`,
    )
    .replace(/(src|href)="\/(?!\/)/g, `$1="${base}/`);
}

export function normalizeJiraIssue(
  issue: JiraIssue,
  fieldDefs: Map<string, JiraField>,
  site: string,
): NormalizedItem {
  const f = issue.fields;
  const r = (issue.renderedFields ?? {}) as Record<string, unknown>;
  const status = f.status as { name: string; statusCategory?: { key: string } } | undefined;
  const item: NormalizedItem = {
    sourceKey: issue.key,
    sourceUrl: jiraLinks.issue(site, issue.key),
    type: String((f.issuetype as { name?: string } | undefined)?.name ?? 'Task'),
    title: String(f.summary ?? issue.key),
    state: status?.name ?? '',
    stateCategory: status?.statusCategory ? JIRA_CATEGORY[status.statusCategory.key] : undefined,
    fields: {},
    html: {},
    createdAt: f.created as string | undefined,
    createdBy: person(f.creator)?.uniqueName ?? person(f.creator)?.displayName,
    changedAt: f.updated as string | undefined,
    people: {},
    tags: [
      ...((f.labels as string[] | undefined) ?? []),
      ...((f.components as { name: string }[] | undefined) ?? []).map((c) => c.name),
    ],
    attachments: (
      (f.attachment as { filename: string; content: string; size?: number }[] | undefined) ?? []
    ).map((a) => ({
      name: a.filename,
      url: a.content,
      size: a.size,
    })),
    links: [],
    hyperlinks: [],
    unsupportedLinks: 0,
  };

  if (typeof r.description === 'string' && r.description)
    item.html.description = sanitizeHtml(absolutizeJiraHtml(r.description, site));
  if (typeof r.environment === 'string' && r.environment)
    item.html.environment = sanitizeHtml(absolutizeJiraHtml(r.environment, site));

  const assignee = person(f.assignee);
  const reporter = person(f.reporter);
  if (assignee) item.people.assignee = assignee;
  if (reporter) item.people.reporter = reporter;

  for (const [key, value] of Object.entries(f)) {
    if (
      HANDLED.has(key) ||
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    )
      continue;
    const def = fieldDefs.get(key);
    const custom = def?.schema?.custom;
    if (custom === SPRINT) {
      const sprints = value as { name: string }[];
      const last = sprints[sprints.length - 1];
      if (last) item.iterationPath = [last.name];
      continue;
    }
    if (custom === EPIC_LINK && typeof value === 'string') {
      item.links.push({ rel: 'System.LinkTypes.Hierarchy-Reverse', targetKey: value });
      continue;
    }
    if (custom === RANK) continue;
    if (def?.schema?.type === 'user') {
      const p = person(value);
      if (p) item.people[key] = p;
      continue;
    }
    // Rich text custom fields come rendered.
    if (typeof r[key] === 'string' && (r[key] as string).includes('<')) {
      item.html[key] = sanitizeHtml(absolutizeJiraHtml(r[key] as string, site));
      continue;
    }
    item.fields[key] = value;
  }

  const parent = f.parent as { key?: string } | undefined;
  if (parent?.key)
    item.links.push({ rel: 'System.LinkTypes.Hierarchy-Reverse', targetKey: parent.key });

  for (const link of (f.issuelinks as
    | { type: { name: string }; outwardIssue?: { key: string }; inwardIssue?: { key: string } }[]
    | undefined) ?? []) {
    const name = link.type.name.toLowerCase();
    // Each link appears on both issues: keep only the outward side (and one side of "relates").
    if (link.outwardIssue) {
      let rel: LinkRel = 'System.LinkTypes.Related';
      if (name.includes('block')) rel = 'System.LinkTypes.Dependency-Forward';
      else if (name.includes('duplicate')) rel = 'System.LinkTypes.Duplicate-Forward';
      else if (name.includes('relate') && link.outwardIssue.key < issue.key) continue;
      item.links.push({ rel, targetKey: link.outwardIssue.key });
    }
  }
  return item;
}

export async function readJiraSnapshot(
  cred: JiraCredential,
  projectKey: string,
  jql: string,
  onProgress: (label: string, pct: number) => void,
  signal?: AbortSignal,
): Promise<SourceSnapshot> {
  onProgress('Reading project details', 5);
  const [project, statuses, fields, sprints] = await Promise.all([
    getJiraProject(cred, projectKey),
    listJiraStatuses(cred, projectKey),
    listJiraFields(cred),
    listJiraSprints(cred, projectKey).catch(() => []),
  ]);
  onProgress('Searching issues', 15);
  const issues = await searchIssues(
    cred,
    jql,
    (n) => onProgress(`Read ${n} issues`, Math.min(90, 15 + n / 20)),
    signal,
  );
  const fieldDefs = new Map(fields.map((x) => [x.id, x]));
  const items = issues.map((i) => normalizeJiraIssue(i, fieldDefs, cred.site));

  const used = new Map<string, SourceField>();
  const people = new Map<string, PersonRef>();
  const label = (key: string) =>
    key === 'assignee'
      ? 'Assignee'
      : key === 'reporter'
        ? 'Reporter'
        : key === 'description'
          ? 'Description'
          : key === 'environment'
            ? 'Environment'
            : (fieldDefs.get(key)?.name ?? key);
  for (const it of items) {
    for (const key of Object.keys(it.fields)) {
      const def = fieldDefs.get(key);
      if (!used.has(key))
        used.set(key, { key, name: label(key), type: def ? jiraType(def) : 'string' });
    }
    for (const key of Object.keys(it.html))
      if (!used.has(key)) used.set(key, { key, name: label(key), type: 'html' });
    for (const [key, p] of Object.entries(it.people)) {
      if (!used.has(key)) used.set(key, { key, name: label(key), type: 'identity' });
      people.set((p.uniqueName ?? p.displayName).toLowerCase(), p);
    }
  }

  const usedTypes = new Set(items.map((i) => i.type));
  const types = statuses
    .filter(
      (s) =>
        usedTypes.has(s.name) ||
        (project.issueTypes ?? []).some((t) => t.name === s.name && usedTypes.has(t.name)),
    )
    .map((s) => ({
      name: s.name,
      states: s.statuses.map((st) => ({
        name: st.name,
        category: JIRA_CATEGORY[st.statusCategory.key],
      })),
    }));
  for (const t of usedTypes)
    if (!types.some((x) => x.name === t)) types.push({ name: t, states: [] });

  onProgress('Done', 100);
  return {
    items,
    types,
    fields: [...used.values()].sort((a, b) => a.name.localeCompare(b.name)),
    areas: [],
    iterations: sprints.map((s) => ({
      name: s.name,
      startDate: s.startDate,
      finishDate: s.endDate,
      children: [],
    })),
    people: [...people.values()],
  };
}

export async function readJiraComments(cred: JiraCredential, item: NormalizedItem) {
  const comments = await listJiraComments(cred, item.sourceKey);
  return comments.map((c) => ({
    author: c.author?.displayName ?? 'Someone',
    date: c.created,
    html: sanitizeHtml(absolutizeJiraHtml(c.renderedBody ?? '', cred.site)),
  }));
}
