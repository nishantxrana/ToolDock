import type { AdoCredential } from '@/store/migrationStore';
import { ado } from './http';

/**
 * Inherited-process customisation, used only for the optional "Add missing to
 * target process" step of the Boards migration.
 * https://learn.microsoft.com/en-us/rest/api/azure/devops/processes/?view=azure-devops-rest-7.1
 */

const V = { 'api-version': '7.1' };
const V_PROPS = { 'api-version': '7.1-preview.1' };

export interface ProcessInfo {
  typeId: string;
  name: string;
  /** 'system' processes (Agile, Scrum, Basic, CMMI) can't be edited. */
  customizationType: 'system' | 'inherited' | 'custom';
}

export interface ProcessWit {
  referenceName: string;
  name: string;
  customization: 'system' | 'inherited' | 'custom';
  inherits?: string;
}

/** The process a project uses: project properties → process details. */
export async function getProjectProcess(
  cred: AdoCredential,
  projectId: string,
): Promise<ProcessInfo | null> {
  const props = await ado<{ value: { name: string; value: string }[] }>(
    cred,
    ['_apis', 'projects', projectId, 'properties'],
    { query: V_PROPS },
  );
  const typeId = props.value.find((p) => p.name === 'System.ProcessTemplateType')?.value;
  if (!typeId) return null;
  return ado<ProcessInfo>(cred, ['_apis', 'work', 'processes', typeId], { query: V });
}

/** GET /{org}/_apis/work/processes/{id}/workitemtypes */
export async function listProcessWits(cred: AdoCredential, processId: string) {
  const data = await ado<{ value: ProcessWit[] }>(
    cred,
    ['_apis', 'work', 'processes', processId, 'workitemtypes'],
    {
      query: V,
    },
  );
  return data.value;
}

const WRITE = { errorContext: 'write' as const, scopeHint: 'Work Items (Read, write & manage)' };

/** Create a brand-new work item type in an inherited process. */
export function createProcessWit(
  cred: AdoCredential,
  processId: string,
  name: string,
  color = '009CCC',
) {
  return ado<ProcessWit>(cred, ['_apis', 'work', 'processes', processId, 'workitemtypes'], {
    method: 'POST',
    query: V,
    body: {
      name,
      color,
      icon: 'icon_clipboard',
      description: 'Created by ToolDock migration',
      isDisabled: false,
    },
    ...WRITE,
  });
}

/** Make an editable copy of a system work item type inside an inherited process. */
export function deriveProcessWit(cred: AdoCredential, processId: string, systemRefName: string) {
  return ado<ProcessWit>(cred, ['_apis', 'work', 'processes', processId, 'workitemtypes'], {
    method: 'POST',
    query: V,
    body: { inheritsFrom: systemRefName, isDisabled: false },
    ...WRITE,
  });
}

/** POST …/workItemTypes/{wit}/states */
export function createProcessState(
  cred: AdoCredential,
  processId: string,
  witRefName: string,
  state: { name: string; stateCategory: string; color?: string },
) {
  return ado<unknown>(
    cred,
    ['_apis', 'work', 'processes', processId, 'workItemTypes', witRefName, 'states'],
    {
      method: 'POST',
      query: V,
      body: {
        name: state.name,
        stateCategory: state.stateCategory,
        color: state.color ?? 'b2b2b2',
      },
      ...WRITE,
    },
  );
}

/** Create an organization field (POST /{org}/_apis/wit/fields). */
export function createOrgField(
  cred: AdoCredential,
  field: { name: string; referenceName: string; type: string; description?: string },
) {
  return ado<unknown>(cred, ['_apis', 'wit', 'fields'], {
    method: 'POST',
    query: V,
    body: { ...field, usage: 'workItem', readOnly: false, canSortBy: true, isQueryable: true },
    ...WRITE,
  });
}

/** Add an organization field to a work item type (POST …/workItemTypes/{wit}/fields). */
export function addFieldToWit(
  cred: AdoCredential,
  processId: string,
  witRefName: string,
  referenceName: string,
) {
  return ado<unknown>(
    cred,
    ['_apis', 'work', 'processes', processId, 'workItemTypes', witRefName, 'fields'],
    {
      method: 'POST',
      query: V,
      body: { referenceName, required: false, readOnly: false },
      ...WRITE,
    },
  );
}
