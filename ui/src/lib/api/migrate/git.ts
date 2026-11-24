import type { AdoCredential } from '@/store/migrationStore';
import { ado } from './http';

const V = { 'api-version': '7.1' };

export interface GitRepo {
  id: string;
  name: string;
  size?: number;
  defaultBranch?: string;
  remoteUrl: string;
  webUrl?: string;
  isDisabled?: boolean;
  project: { id: string; name: string };
}

/** GET /{org}/{project}/_apis/git/repositories */
export async function listRepos(cred: AdoCredential, project: string, signal?: AbortSignal) {
  const data = await ado<{ value: GitRepo[] }>(cred, [project, '_apis', 'git', 'repositories'], {
    query: { ...V, includeHidden: 'true' },
    signal,
  });
  return [...data.value].sort((a, b) => a.name.localeCompare(b.name));
}

/** POST /{org}/{project}/_apis/git/repositories */
export function createRepo(cred: AdoCredential, projectId: string, name: string) {
  return ado<GitRepo>(cred, [projectId, '_apis', 'git', 'repositories'], {
    method: 'POST',
    query: V,
    body: { name, project: { id: projectId } },
    errorContext: 'write',
    scopeHint: 'Code (Read, write & manage)',
  });
}

export type ImportStatus = 'queued' | 'inProgress' | 'completed' | 'failed' | 'abandoned';

export interface ImportRequest {
  importRequestId: number;
  status: ImportStatus;
  detailedStatus?: {
    currentStep?: number;
    allSteps?: string[];
    errorMessage?: string;
  };
}

/**
 * Ask Azure DevOps to clone `gitUrl` into the (empty) repo. The credentials
 * live in a service connection that Azure DevOps deletes once the import is
 * done. https://learn.microsoft.com/en-us/rest/api/azure/devops/git/import-requests/create?view=azure-devops-rest-7.1
 */
export function createImportRequest(
  cred: AdoCredential,
  projectId: string,
  repoId: string,
  gitUrl: string,
  serviceEndpointId: string,
) {
  return ado<ImportRequest>(
    cred,
    [projectId, '_apis', 'git', 'repositories', repoId, 'importRequests'],
    {
      method: 'POST',
      query: V,
      body: {
        parameters: {
          gitSource: { url: gitUrl, overwrite: false },
          serviceEndpointId,
          deleteServiceEndpointAfterImportIsDone: true,
        },
      },
      errorContext: 'write',
      scopeHint: 'Code (Read, write & manage)',
    },
  );
}

/** GET /{org}/{project}/_apis/git/repositories/{repo}/importRequests/{id} */
export function getImportRequest(
  cred: AdoCredential,
  projectId: string,
  repoId: string,
  importRequestId: number,
  signal?: AbortSignal,
) {
  return ado<ImportRequest>(
    cred,
    [projectId, '_apis', 'git', 'repositories', repoId, 'importRequests', String(importRequestId)],
    { query: V, signal },
  );
}

/** Raw text of one file at a branch, or null if it doesn't exist. */
export async function getFileText(
  cred: AdoCredential,
  projectId: string,
  repoId: string,
  path: string,
  branch?: string,
): Promise<string | null> {
  try {
    const item = await ado<{ content?: string }>(
      cred,
      [projectId, '_apis', 'git', 'repositories', repoId, 'items'],
      {
        query: {
          ...V,
          path,
          includeContent: 'true',
          $format: 'json',
          ...(branch
            ? {
                'versionDescriptor.version': branch.replace(/^refs\/heads\//, ''),
                'versionDescriptor.versionType': 'branch',
              }
            : {}),
        },
      },
    );
    return item.content ?? null;
  } catch {
    return null;
  }
}

export interface PolicyConfiguration {
  id: number;
  isEnabled: boolean;
  isBlocking: boolean;
  isDeleted?: boolean;
  type: { id: string; displayName?: string };
  settings: Record<string, unknown> & {
    scope?: { repositoryId?: string | null; refName?: string; matchKind?: string }[];
  };
}

/** GET /{org}/{project}/_apis/policy/configurations (all pages). */
export async function listPolicies(cred: AdoCredential, project: string) {
  const all: PolicyConfiguration[] = [];
  let skip = 0;
  for (;;) {
    const page = await ado<{ value: PolicyConfiguration[] }>(
      cred,
      [project, '_apis', 'policy', 'configurations'],
      {
        query: { ...V, $top: '200', $skip: String(skip) },
      },
    );
    all.push(...page.value);
    if (page.value.length < 200) break;
    skip += 200;
  }
  return all.filter((p) => !p.isDeleted);
}

/** POST /{org}/{project}/_apis/policy/configurations */
export function createPolicy(
  cred: AdoCredential,
  projectId: string,
  body: Omit<PolicyConfiguration, 'id'>,
) {
  return ado<PolicyConfiguration>(cred, [projectId, '_apis', 'policy', 'configurations'], {
    method: 'POST',
    query: V,
    body,
    errorContext: 'write',
    scopeHint: 'Code (Read, write & manage)',
  });
}
