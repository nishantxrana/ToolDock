import type { JiraCredential } from '@/store/migrationStore';
import { jira } from './http';

/**
 * Jira Cloud REST v3 + Agile v1.0, read-only. Every call goes through the
 * `/jira/{site}` proxy, which only accepts GET plus POST to /search/jql.
 */

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  issueTypes?: { id: string; name: string; subtask: boolean }[];
}

export function getMyself(cred: JiraCredential) {
  return jira<JiraUser>(cred, ['rest', 'api', '3', 'myself']);
}

/** GET /rest/api/3/project/search (all pages). */
export async function listJiraProjects(cred: JiraCredential) {
  const all: JiraProject[] = [];
  let startAt = 0;
  for (;;) {
    const page = await jira<{ values: JiraProject[]; isLast: boolean }>(
      cred,
      ['rest', 'api', '3', 'project', 'search'],
      { query: { startAt: String(startAt), maxResults: '50' } },
    );
    all.push(...page.values);
    if (page.isLast || page.values.length === 0) break;
    startAt += page.values.length;
  }
  return all;
}

/** GET /rest/api/3/project/{key} (includes the project's issue types). */
export function getJiraProject(cred: JiraCredential, key: string) {
  return jira<JiraProject>(cred, ['rest', 'api', '3', 'project', key]);
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory: { key: 'new' | 'indeterminate' | 'done' | string; name: string };
}

/** GET /rest/api/3/project/{key}/statuses → statuses per issue type. */
export function listJiraStatuses(cred: JiraCredential, key: string) {
  return jira<{ id: string; name: string; statuses: JiraStatus[] }[]>(cred, [
    'rest',
    'api',
    '3',
    'project',
    key,
    'statuses',
  ]);
}

export interface JiraField {
  id: string;
  name: string;
  custom: boolean;
  schema?: { type: string; custom?: string; items?: string };
}

export function listJiraFields(cred: JiraCredential) {
  return jira<JiraField[]>(cred, ['rest', 'api', '3', 'field']);
}

export function listJiraPriorities(cred: JiraCredential) {
  return jira<{ id: string; name: string }[]>(cred, ['rest', 'api', '3', 'priority']);
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: Record<string, unknown>;
  renderedFields?: Record<string, unknown>;
}

/**
 * POST /rest/api/3/search/jql, following nextPageToken.
 * renderedFields gives HTML, so Atlassian's document format never needs converting.
 */
export async function searchIssues(
  cred: JiraCredential,
  jql: string,
  onPage?: (fetched: number) => void,
  signal?: AbortSignal,
) {
  const all: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const page = await jira<{ issues: JiraIssue[]; nextPageToken?: string }>(
      cred,
      ['rest', 'api', '3', 'search', 'jql'],
      {
        method: 'POST',
        body: {
          jql,
          maxResults: 100,
          fields: ['*all'],
          expand: 'renderedFields',
          ...(nextPageToken ? { nextPageToken } : {}),
        },
        signal,
      },
    );
    all.push(...page.issues);
    onPage?.(all.length);
    nextPageToken = page.nextPageToken;
  } while (nextPageToken);
  return all;
}

export interface JiraComment {
  id: string;
  author?: JiraUser;
  created: string;
  renderedBody?: string;
}

/** GET /rest/api/3/issue/{key}/comment?expand=renderedBody (all pages). */
export async function listJiraComments(cred: JiraCredential, key: string) {
  const all: JiraComment[] = [];
  let startAt = 0;
  for (;;) {
    const page = await jira<{ comments: JiraComment[]; total: number }>(
      cred,
      ['rest', 'api', '3', 'issue', key, 'comment'],
      {
        query: {
          expand: 'renderedBody',
          startAt: String(startAt),
          maxResults: '100',
          orderBy: 'created',
        },
      },
    );
    all.push(...page.comments);
    startAt += page.comments.length;
    if (page.comments.length === 0 || startAt >= page.total) break;
  }
  return all;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
}

/** Sprints from every Scrum board of the project (de-duplicated). */
export async function listJiraSprints(cred: JiraCredential, projectKey: string) {
  const boards = await jira<{ values: { id: number; type: string }[] }>(
    cred,
    ['rest', 'agile', '1.0', 'board'],
    {
      query: { projectKeyOrId: projectKey, maxResults: '50' },
    },
  );
  const sprints = new Map<number, JiraSprint>();
  for (const board of boards.values.filter((b) => b.type === 'scrum')) {
    let startAt = 0;
    for (;;) {
      const page = await jira<{ values: JiraSprint[]; isLast: boolean }>(
        cred,
        ['rest', 'agile', '1.0', 'board', String(board.id), 'sprint'],
        { query: { startAt: String(startAt), maxResults: '50' } },
      );
      for (const s of page.values) sprints.set(s.id, s);
      if (page.isLast || page.values.length === 0) break;
      startAt += page.values.length;
    }
  }
  return [...sprints.values()];
}
