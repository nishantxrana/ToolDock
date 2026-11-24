import type { AdoCredential } from '@/store/migrationStore';
import { ado } from './http';

const V = { 'api-version': '7.1' };
const V_COMMENTS = { 'api-version': '7.1-preview.4' };
const PATCH_JSON = 'application/json-patch+json';

export interface WorkItemRelation {
  rel: string;
  url: string;
  attributes?: Record<string, unknown>;
}

export interface WorkItem {
  id: number;
  rev?: number;
  url?: string;
  fields: Record<string, unknown>;
  relations?: WorkItemRelation[];
}

export type PatchOp = { op: 'add' | 'replace' | 'remove' | 'test'; path: string; value?: unknown };

/** POST /{org}/{project}/_apis/wit/wiql → matching IDs (max 20,000). */
export async function queryIds(
  cred: AdoCredential,
  project: string,
  wiql: string,
  signal?: AbortSignal,
) {
  const data = await ado<{ workItems: { id: number }[] }>(cred, [project, '_apis', 'wit', 'wiql'], {
    method: 'POST',
    query: { ...V, $top: '20000' },
    body: { query: wiql },
    signal,
  });
  return data.workItems.map((w) => w.id);
}

/**
 * POST /{org}/_apis/wit/workitemsbatch, 200 IDs at a time, with relations.
 * ($expand can't be combined with a field list, so all fields come back.)
 */
export async function getWorkItems(cred: AdoCredential, ids: number[], signal?: AbortSignal) {
  const out: WorkItem[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const data = await ado<{ value: WorkItem[] }>(cred, ['_apis', 'wit', 'workitemsbatch'], {
      method: 'POST',
      query: V,
      body: { ids: ids.slice(i, i + 200), $expand: 'Relations', errorPolicy: 'Omit' },
      signal,
    });
    out.push(...data.value.filter(Boolean));
  }
  return out;
}

interface WriteFlags {
  bypassRules?: boolean;
  suppressNotifications?: boolean;
}

function flags(f: WriteFlags) {
  return {
    ...V,
    ...(f.bypassRules ? { bypassRules: 'true' } : {}),
    ...(f.suppressNotifications ? { suppressNotifications: 'true' } : {}),
  };
}

/** POST /{org}/{project}/_apis/wit/workitems/${type} */
export function createWorkItem(
  cred: AdoCredential,
  projectId: string,
  type: string,
  patch: PatchOp[],
  f: WriteFlags = {},
) {
  return ado<WorkItem>(cred, [projectId, '_apis', 'wit', 'workitems', `$${type}`], {
    method: 'POST',
    query: flags(f),
    body: patch,
    contentType: PATCH_JSON,
    errorContext: 'write',
    scopeHint: 'Work Items (Read, write & manage)',
  });
}

/** PATCH /{org}/_apis/wit/workitems/{id} */
export function updateWorkItem(
  cred: AdoCredential,
  id: number,
  patch: PatchOp[],
  f: WriteFlags = {},
) {
  return ado<WorkItem>(cred, ['_apis', 'wit', 'workitems', String(id)], {
    method: 'PATCH',
    query: flags(f),
    body: patch,
    contentType: PATCH_JSON,
    errorContext: 'write',
    scopeHint: 'Work Items (Read, write & manage)',
  });
}

/** POST /{org}/{project}/_apis/wit/attachments?fileName=… (raw bytes). */
export function uploadAttachment(
  cred: AdoCredential,
  projectId: string,
  fileName: string,
  data: Blob,
) {
  return ado<{ id: string; url: string }>(cred, [projectId, '_apis', 'wit', 'attachments'], {
    method: 'POST',
    query: { ...V, fileName, uploadType: 'Simple' },
    rawBody: data,
    contentType: 'application/octet-stream',
    errorContext: 'write',
    scopeHint: 'Work Items (Read, write & manage)',
  });
}

export interface WorkItemComment {
  id: number;
  text: string;
  createdBy?: { displayName?: string; uniqueName?: string };
  createdDate?: string;
  isDeleted?: boolean;
}

/** GET …/workItems/{id}/comments, all pages, oldest first. */
export async function listComments(cred: AdoCredential, project: string, id: number) {
  const all: WorkItemComment[] = [];
  let token: string | undefined;
  do {
    const page = await ado<{ comments: WorkItemComment[]; continuationToken?: string }>(
      cred,
      [project, '_apis', 'wit', 'workItems', String(id), 'comments'],
      {
        query: {
          ...V_COMMENTS,
          $top: '200',
          order: 'asc',
          ...(token ? { continuationToken: token } : {}),
        },
      },
    );
    all.push(...page.comments.filter((c) => !c.isDeleted));
    token = page.continuationToken;
  } while (token);
  return all;
}

/** POST …/workItems/{id}/comments (api-version 7.1-preview.4). */
export function addComment(cred: AdoCredential, projectId: string, id: number, text: string) {
  return ado<WorkItemComment>(
    cred,
    [projectId, '_apis', 'wit', 'workItems', String(id), 'comments'],
    {
      method: 'POST',
      query: V_COMMENTS,
      body: { text },
      errorContext: 'write',
      scopeHint: 'Work Items (Read, write & manage)',
    },
  );
}

export type NodeGroup = 'Areas' | 'Iterations';

export interface ClassificationNode {
  id: number;
  name: string;
  path?: string;
  hasChildren?: boolean;
  attributes?: { startDate?: string; finishDate?: string };
  children?: ClassificationNode[];
}

/** GET …/wit/classificationnodes/{Areas|Iterations}?$depth=20 */
export function getNodeTree(cred: AdoCredential, project: string, group: NodeGroup) {
  return ado<ClassificationNode>(cred, [project, '_apis', 'wit', 'classificationnodes', group], {
    query: { ...V, $depth: '20' },
  });
}

/** POST …/wit/classificationnodes/{group}/{parentPath} */
export function createNode(
  cred: AdoCredential,
  projectId: string,
  group: NodeGroup,
  parentPath: string[],
  name: string,
  attributes?: { startDate?: string; finishDate?: string },
) {
  return ado<ClassificationNode>(
    cred,
    [projectId, '_apis', 'wit', 'classificationnodes', group, ...parentPath],
    {
      method: 'POST',
      query: V,
      body: { name, ...(attributes ? { attributes } : {}) },
      errorContext: 'write',
      scopeHint: 'Work Items (Read, write & manage)',
    },
  );
}

export interface WitState {
  name: string;
  color?: string;
  category: string;
}

export interface WitType {
  name: string;
  referenceName: string;
  isDisabled?: boolean;
  states?: WitState[];
  fields?: { referenceName: string; name: string; alwaysRequired?: boolean }[];
}

/** GET /{org}/{project}/_apis/wit/workitemtypes (types with their states and fields). */
export async function listWorkItemTypes(cred: AdoCredential, project: string) {
  const data = await ado<{ value: WitType[] }>(cred, [project, '_apis', 'wit', 'workitemtypes'], {
    query: V,
  });
  return data.value.filter((t) => !t.isDisabled);
}

export interface WitField {
  name: string;
  referenceName: string;
  type: string;
  readOnly?: boolean;
  isIdentity?: boolean;
  isPicklist?: boolean;
}

/** GET /{org}/{project}/_apis/wit/fields */
export async function listFields(cred: AdoCredential, project: string) {
  const data = await ado<{ value: WitField[] }>(cred, [project, '_apis', 'wit', 'fields'], {
    query: V,
  });
  return data.value;
}

export interface TeamMember {
  identity: { id: string; displayName: string; uniqueName: string };
}

/** Everyone in any team of the project (de-duplicated), for user mapping. */
export async function listProjectMembers(cred: AdoCredential, projectId: string) {
  const teams = await ado<{ value: { id: string; name: string }[] }>(
    cred,
    ['_apis', 'projects', projectId, 'teams'],
    { query: { ...V, $top: '500' } },
  );
  const seen = new Map<string, TeamMember['identity']>();
  for (const team of teams.value) {
    const members = await ado<{ value: TeamMember[] }>(
      cred,
      ['_apis', 'projects', projectId, 'teams', team.id, 'members'],
      { query: { ...V, $top: '1000' } },
    );
    for (const m of members.value) seen.set(m.identity.uniqueName.toLowerCase(), m.identity);
  }
  return [...seen.values()];
}
