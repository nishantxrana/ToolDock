import type { AdoCredential } from '@/store/migrationStore';
import { AdoError } from '@/lib/api/errors';
import { ado } from './http';

const V = { 'api-version': '7.1' };

export interface ServiceEndpoint {
  id: string;
  name: string;
  type: string;
  url?: string;
  isReady?: boolean;
}

/** GET /{org}/{project}/_apis/serviceendpoint/endpoints */
export async function listEndpoints(cred: AdoCredential, project: string, signal?: AbortSignal) {
  const data = await ado<{ value: ServiceEndpoint[] }>(
    cred,
    [project, '_apis', 'serviceendpoint', 'endpoints'],
    {
      query: V,
      signal,
    },
  );
  return data.value;
}

/**
 * Create the short-lived connection the Git import uses to read the source
 * repo. Tries the "git" type first (what Azure DevOps' own import wizard
 * creates) and falls back to "Generic", which the 7.1 docs show.
 * https://learn.microsoft.com/en-us/rest/api/azure/devops/serviceendpoint/endpoints/create?view=azure-devops-rest-7.1
 */
export async function createGitImportEndpoint(
  cred: AdoCredential,
  project: { id: string; name: string },
  name: string,
  sourceUrl: string,
  sourcePat: string,
): Promise<ServiceEndpoint> {
  const body = (type: string) => ({
    name,
    type,
    url: sourceUrl,
    description:
      'Temporary connection created by ToolDock for a repository import. Deleted automatically.',
    authorization: {
      scheme: 'UsernamePassword',
      parameters: { username: 'pat', password: sourcePat },
    },
    isShared: false,
    isReady: true,
    serviceEndpointProjectReferences: [
      { projectReference: { id: project.id, name: project.name }, name, description: '' },
    ],
  });
  const create = (type: string) =>
    ado<ServiceEndpoint>(cred, ['_apis', 'serviceendpoint', 'endpoints'], {
      method: 'POST',
      query: V,
      body: body(type),
      errorContext: 'write',
      scopeHint: 'Service Connections (Read, query & manage)',
    });
  try {
    return await create('git');
  } catch (e) {
    if (e instanceof AdoError && e.kind === 'rejected') return create('Generic');
    throw e;
  }
}

/** DELETE /{org}/_apis/serviceendpoint/endpoints/{id}?projectIds=… (best effort). */
export async function deleteEndpoint(
  cred: AdoCredential,
  id: string,
  projectId: string,
): Promise<boolean> {
  try {
    await ado<void>(cred, ['_apis', 'serviceendpoint', 'endpoints', id], {
      method: 'DELETE',
      query: { ...V, projectIds: projectId },
      errorContext: 'write',
    });
    return true;
  } catch (e) {
    // Already gone (the import deletes it itself) counts as cleaned up.
    return e instanceof AdoError && e.kind === 'not-found';
  }
}
