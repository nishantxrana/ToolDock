import type { AdoCredential } from '@/store/migrationStore';
import { ado, vsrm } from './http';

/**
 * Pipelines endpoints. Definitions are handled as plain JSON because the
 * rewriters (lib/migration/pipelines/rewrite.ts) need every field the server
 * returns, not a typed subset.
 */

const V = { 'api-version': '7.1' };
const V_PREVIEW = { 'api-version': '7.1-preview.1' };

export type Json = Record<string, unknown>;
export interface DefinitionRef {
  id: number;
  name: string;
  path?: string;
}

/** GET /{org}/{project}/_apis/build/definitions (refs, all pages). */
export async function listBuildDefinitions(cred: AdoCredential, project: string) {
  const data = await ado<{ value: (DefinitionRef & { type?: string })[] }>(
    cred,
    [project, '_apis', 'build', 'definitions'],
    { query: { ...V, $top: '1000', queryOrder: 'definitionNameAscending' } },
  );
  return data.value;
}

/** GET /{org}/{project}/_apis/build/definitions/{id} (full JSON). */
export function getBuildDefinition(cred: AdoCredential, project: string, id: number) {
  return ado<Json>(cred, [project, '_apis', 'build', 'definitions', String(id)], { query: V });
}

/** POST /{org}/{project}/_apis/build/definitions */
export function createBuildDefinition(cred: AdoCredential, projectId: string, body: Json) {
  return ado<Json & { id: number }>(cred, [projectId, '_apis', 'build', 'definitions'], {
    method: 'POST',
    query: V,
    body,
    errorContext: 'write',
    scopeHint: 'Build (Read & execute)',
  });
}

/** GET vsrm /{org}/{project}/_apis/release/definitions (refs). */
export async function listReleaseDefinitionsFor(cred: AdoCredential, project: string) {
  const data = await vsrm<{ value: DefinitionRef[] }>(
    cred,
    [project, '_apis', 'release', 'definitions'],
    {
      query: { ...V, $top: '1000' },
    },
  );
  return data.value;
}

/** GET vsrm /{org}/{project}/_apis/release/definitions/{id} */
export function getReleaseDefinitionJson(cred: AdoCredential, project: string, id: number) {
  return vsrm<Json>(cred, [project, '_apis', 'release', 'definitions', String(id)], { query: V });
}

/** POST vsrm /{org}/{project}/_apis/release/definitions */
export function createReleaseDefinition(cred: AdoCredential, projectId: string, body: Json) {
  return vsrm<Json & { id: number }>(cred, [projectId, '_apis', 'release', 'definitions'], {
    method: 'POST',
    query: V,
    body,
    errorContext: 'write',
    scopeHint: 'Release (Read, write, execute & manage)',
  });
}

/** GET /{org}/{project}/_apis/distributedtask/taskgroups */
export async function listTaskGroups(cred: AdoCredential, project: string) {
  const data = await ado<{ value: Json[] }>(
    cred,
    [project, '_apis', 'distributedtask', 'taskgroups'],
    {
      query: V,
    },
  );
  return data.value;
}

/** POST /{org}/{project}/_apis/distributedtask/taskgroups */
export function createTaskGroup(cred: AdoCredential, projectId: string, body: Json) {
  return ado<Json & { id: string }>(cred, [projectId, '_apis', 'distributedtask', 'taskgroups'], {
    method: 'POST',
    query: V,
    body,
    errorContext: 'write',
    scopeHint: 'Task Groups (Read, create & manage)',
  });
}

export interface AgentQueue {
  id: number;
  name: string;
  pool?: { id: number; name: string; isHosted?: boolean };
}

/** GET /{org}/{project}/_apis/distributedtask/queues */
export async function listQueues(cred: AdoCredential, project: string) {
  const data = await ado<{ value: AgentQueue[] }>(
    cred,
    [project, '_apis', 'distributedtask', 'queues'],
    {
      query: V_PREVIEW,
    },
  );
  return data.value;
}

export interface Environment {
  id: number;
  name: string;
}

/** GET /{org}/{project}/_apis/distributedtask/environments */
export async function listEnvironments(cred: AdoCredential, project: string) {
  const data = await ado<{ value: Environment[] }>(
    cred,
    [project, '_apis', 'distributedtask', 'environments'],
    {
      query: { ...V_PREVIEW, $top: '1000' },
    },
  );
  return data.value;
}

/** POST /{org}/{project}/_apis/distributedtask/environments */
export function createEnvironment(
  cred: AdoCredential,
  projectId: string,
  name: string,
  description = '',
) {
  return ado<Environment>(cred, [projectId, '_apis', 'distributedtask', 'environments'], {
    method: 'POST',
    query: V_PREVIEW,
    body: { name, description },
    errorContext: 'write',
    scopeHint: 'Environment (Read & manage)',
  });
}

export interface DeploymentGroup {
  id: number;
  name: string;
}

/** GET /{org}/{project}/_apis/distributedtask/deploymentgroups */
export async function listDeploymentGroups(cred: AdoCredential, project: string) {
  const data = await ado<{ value: DeploymentGroup[] }>(
    cred,
    [project, '_apis', 'distributedtask', 'deploymentgroups'],
    { query: V_PREVIEW },
  );
  return data.value;
}

export interface TaskDefinition {
  id: string;
  name: string;
  friendlyName?: string;
  version?: { major: number; minor: number; patch: number };
  contributionIdentifier?: string;
}

/**
 * The org's installed pipeline tasks (built-in and from extensions). Used to
 * spot tasks whose extension isn't installed in the target.
 * GET /{org}/_apis/distributedtask/tasks
 */
export async function listTasks(cred: AdoCredential) {
  const data = await ado<{ value: TaskDefinition[] }>(cred, ['_apis', 'distributedtask', 'tasks'], {
    query: V_PREVIEW,
  });
  return data.value;
}

/** The identity behind the token (used as release stage owner). GET /{org}/_apis/connectionData */
export async function getAuthenticatedUserId(cred: AdoCredential): Promise<string | undefined> {
  const data = await ado<{ authenticatedUser?: { id?: string } }>(
    cred,
    ['_apis', 'connectionData'],
    {
      query: { connectOptions: 'none', lastChangeId: '-1', lastChangeId64: '-1' },
    },
  );
  return data.authenticatedUser?.id;
}
