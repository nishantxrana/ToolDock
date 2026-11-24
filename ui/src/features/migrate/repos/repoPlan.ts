import type { GitRepo, PolicyConfiguration } from '@/lib/api/migrate/git';

/** Branch policy types we treat specially. https://learn.microsoft.com/en-us/rest/api/azure/devops/policy/types */
export const POLICY_TYPE = {
  buildValidation: '0609b952-1397-4640-95ec-e00a01b2c241',
  requiredReviewers: 'fd2167ab-b0be-447a-8ec8-39368250530e',
};

export function isEmptyRepo(r: Pick<GitRepo, 'size' | 'defaultBranch'>) {
  return !r.defaultBranch && !r.size;
}

export function formatSize(bytes?: number) {
  if (!bytes) return 'Empty';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** The clone URL without any user name in it (credentials come from the connection). */
export function cleanRemoteUrl(remoteUrl: string): string {
  try {
    const u = new URL(remoteUrl);
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    return remoteUrl;
  }
}

/** What happens to a chosen repo in the target, given its target name. */
export function targetPlan(
  name: string,
  targetRepos: GitRepo[],
): 'create' | 'import-into-empty' | 'blocked' | 'invalid' {
  const n = name.trim();
  if (!n || /[\\/:*?"<>|#$}{,+=[\]^]/.test(n) || n.startsWith('.') || n.endsWith('.'))
    return 'invalid';
  const existing = targetRepos.find((r) => r.name.toLowerCase() === n.toLowerCase());
  if (!existing) return 'create';
  return isEmptyRepo(existing) ? 'import-into-empty' : 'blocked';
}

/** Rewrite a source policy for the new repo, or explain why it can't be copied. */
export function rewritePolicy(
  p: PolicyConfiguration,
  sourceRepoId: string,
  targetRepoId: string,
): { body: Omit<PolicyConfiguration, 'id'> } | { skip: string } {
  if (p.type.id === POLICY_TYPE.buildValidation)
    return { skip: 'build validation (needs the pipeline in the target)' };
  if (p.type.id === POLICY_TYPE.requiredReviewers)
    return { skip: 'required reviewers (people and groups differ between organizations)' };
  const scope = (p.settings.scope ?? [])
    .filter((s) => s.repositoryId === sourceRepoId)
    .map((s) => ({ ...s, repositoryId: targetRepoId }));
  if (scope.length === 0) return { skip: 'not scoped to this repository' };
  return {
    body: {
      isEnabled: p.isEnabled,
      isBlocking: p.isBlocking,
      type: { id: p.type.id },
      settings: { ...p.settings, scope },
    },
  };
}
