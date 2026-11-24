/**
 * Deep links into Azure DevOps (and the Marketplace) for the migration report,
 * so every "to do" item opens the exact page where the user finishes it.
 */

const enc = encodeURIComponent;

function base(org: string, project: string) {
  return `https://dev.azure.com/${enc(org)}/${enc(project)}`;
}

export const adoLinks = {
  project: (org: string, project: string) => base(org, project),
  variableGroup: (org: string, project: string, id: number | string) =>
    `${base(org, project)}/_library?itemType=VariableGroups&view=VariableGroupView&variableGroupId=${enc(String(id))}`,
  library: (org: string, project: string) =>
    `${base(org, project)}/_library?itemType=VariableGroups`,
  serviceConnections: (org: string, project: string) =>
    `${base(org, project)}/_settings/adminservices`,
  repo: (org: string, project: string, repo: string) => `${base(org, project)}/_git/${enc(repo)}`,
  branchPolicies: (org: string, project: string, repoId: string) =>
    `${base(org, project)}/_settings/repositories?repo=${enc(repoId)}&_a=policiesMid`,
  buildPipeline: (org: string, project: string, id: number | string) =>
    `${base(org, project)}/_build?definitionId=${enc(String(id))}`,
  buildPipelineEdit: (org: string, project: string, id: number | string) =>
    `${base(org, project)}/_apps/hub/ms.vss-build-web.ci-designer-hub?pipelineId=${enc(String(id))}&_a=edit-build-definition`,
  releasePipeline: (org: string, project: string, id: number | string) =>
    `${base(org, project)}/_release?definitionId=${enc(String(id))}`,
  environment: (org: string, project: string, id: number | string) =>
    `${base(org, project)}/_environments/${enc(String(id))}`,
  environments: (org: string, project: string) => `${base(org, project)}/_environments`,
  deploymentGroups: (org: string, project: string) => `${base(org, project)}/_machinegroup`,
  agentQueues: (org: string, project: string) => `${base(org, project)}/_settings/agentqueues`,
  workItem: (org: string, project: string, id: number | string) =>
    `${base(org, project)}/_workitems/edit/${enc(String(id))}`,
  boardsSettings: (org: string, project: string) => `${base(org, project)}/_settings/work-team`,
  queries: (org: string, project: string) => `${base(org, project)}/_queries`,
  processSettings: (org: string) => `https://dev.azure.com/${enc(org)}/_settings/process`,
  extensions: (org: string) => `https://dev.azure.com/${enc(org)}/_settings/extensions`,
  tokens: (org: string) => `https://dev.azure.com/${enc(org)}/_usersSettings/tokens`,
};

export function marketplaceLink(contributionIdentifier: string): string {
  // contributionIdentifier looks like "publisher.extension.contribution".
  const [publisher, extension] = contributionIdentifier.split('.');
  return publisher && extension
    ? `https://marketplace.visualstudio.com/items?itemName=${enc(publisher)}.${enc(extension)}`
    : 'https://marketplace.visualstudio.com/azuredevops';
}

export const jiraLinks = {
  issue: (site: string, key: string) => `https://${site}.atlassian.net/browse/${enc(key)}`,
  apiTokens: () => 'https://id.atlassian.com/manage-profile/security/api-tokens',
};
