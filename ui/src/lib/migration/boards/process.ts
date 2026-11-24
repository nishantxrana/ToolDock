import {
  addFieldToWit,
  createOrgField,
  createProcessState,
  createProcessWit,
  deriveProcessWit,
  getProjectProcess,
  listProcessWits,
  type ProcessInfo,
  type ProcessWit,
} from '@/lib/api/migrate/processes';
import { adoLinks } from '@/lib/migration/links';
import type { AdoCredential } from '@/store/migrationStore';
import type { WriterApi } from './writer';
import { CREATE, type BoardsMapping, type SourceSnapshot } from './types';

/** Does the mapping ask for anything to be created in the target process? */
export function needsAlignment(m: BoardsMapping): boolean {
  return (
    Object.values(m.types).includes(CREATE) ||
    Object.values(m.states).some((s) => Object.values(s).includes(CREATE)) ||
    Object.values(m.fields).includes(CREATE)
  );
}

/** A reference name Azure DevOps accepts for a new custom field. */
export function customFieldRef(name: string): string {
  const clean = name
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return `Custom.${clean || 'MigratedField'}`;
}

export async function targetProcess(
  cred: AdoCredential,
  projectId: string,
): Promise<ProcessInfo | null> {
  try {
    return await getProjectProcess(cred, projectId);
  } catch {
    return null;
  }
}

/**
 * Create the work item types, states and fields the mapping marked "Create in
 * target". Only works on an inherited process. Returns the mapping with every
 * CREATE replaced by the real name or reference name.
 */
export async function alignProcess(
  api: WriterApi,
  cred: AdoCredential & { project: { id: string; name: string } },
  mapping: BoardsMapping,
  snapshot: SourceSnapshot,
): Promise<BoardsMapping> {
  const m: BoardsMapping = JSON.parse(JSON.stringify(mapping)) as BoardsMapping;
  const proc = await getProjectProcess(cred, cred.project.id);
  if (!proc || proc.customizationType !== 'inherited') {
    api.report({
      area: 'Boards',
      severity: 'action',
      title: "Target process can't be changed",
      detail:
        'The target project uses a built-in process, which can\'t be edited. Items mapped to "create" were left unmapped. Change the project to an inherited process, then run again.',
      targetUrl: adoLinks.processSettings(cred.organization),
    });
    for (const k of Object.keys(m.types)) if (m.types[k] === CREATE) m.types[k] = '__none__';
    for (const t of Object.keys(m.states))
      for (const s of Object.keys(m.states[t]!))
        if (m.states[t]![s] === CREATE) m.states[t]![s] = '__none__';
    for (const k of Object.keys(m.fields)) if (m.fields[k] === CREATE) m.fields[k] = '__append__';
    return m;
  }

  let wits: ProcessWit[] = await listProcessWits(cred, proc.typeId);
  /** Editable reference name for a target type, deriving it from the system type if needed. */
  const editable = async (name: string): Promise<string> => {
    const w = wits.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!w) throw new Error(`Type "${name}" isn't in the target process.`);
    if (w.customization !== 'system') return w.referenceName;
    const derived = await deriveProcessWit(cred, proc.typeId, w.referenceName);
    wits = await listProcessWits(cred, proc.typeId);
    return derived.referenceName;
  };

  const tasks: Parameters<WriterApi['phase']>[1] = [];
  for (const [src, to] of Object.entries(m.types)) {
    if (to !== CREATE) continue;
    tasks.push({
      key: `wit:${src}`,
      label: `Create type "${src}"`,
      journal: { kind: 'process-type', sourceId: src },
      run: async () => {
        const created = await createProcessWit(cred, proc.typeId, src);
        wits = await listProcessWits(cred, proc.typeId);
        m.types[src] = created.name;
        return { status: 'ok' as const, targetId: created.referenceName };
      },
    });
  }
  await api.phase('Adding work item types to the target process', tasks, 1);
  for (const [src, to] of Object.entries(m.types)) if (to === CREATE) m.types[src] = src; // created earlier (resumed run)

  const stateTasks: Parameters<WriterApi['phase']>[1] = [];
  for (const [srcType, states] of Object.entries(m.states)) {
    const targetType = m.types[srcType];
    if (!targetType || targetType === '__none__') continue;
    for (const [srcState, to] of Object.entries(states)) {
      if (to !== CREATE) continue;
      const category =
        snapshot.types.find((t) => t.name === srcType)?.states.find((s) => s.name === srcState)
          ?.category ?? 'InProgress';
      stateTasks.push({
        key: `state:${targetType}:${srcState}`,
        label: `Add state "${srcState}" to ${targetType}`,
        journal: { kind: 'process-state', sourceId: `${targetType}|${srcState}`.toLowerCase() },
        run: async () => {
          const ref = await editable(targetType);
          await createProcessState(cred, proc.typeId, ref, {
            name: srcState,
            stateCategory: category === 'Removed' ? 'Removed' : category,
          });
          return { status: 'ok' as const };
        },
      });
      states[srcState] = srcState;
    }
  }
  await api.phase('Adding states to the target process', stateTasks, 1);

  const fieldTasks: Parameters<WriterApi['phase']>[1] = [];
  const usedTargetTypes = [...new Set(Object.values(m.types).filter((t) => t && t !== '__none__'))];
  for (const [key, to] of Object.entries(m.fields)) {
    if (to !== CREATE) continue;
    const f = snapshot.fields.find((x) => x.key === key);
    if (!f) continue;
    const ref = customFieldRef(f.name);
    const type =
      f.type === 'html'
        ? 'html'
        : f.type === 'double' || f.type === 'integer'
          ? f.type
          : f.type === 'dateTime'
            ? 'dateTime'
            : 'string';
    fieldTasks.push({
      key: `field:${key}`,
      label: `Add field "${f.name}"`,
      journal: { kind: 'process-field', sourceId: key },
      run: async () => {
        try {
          await createOrgField(cred, {
            name: f.name,
            referenceName: ref,
            type,
            description: 'Created by ToolDock migration',
          });
        } catch {
          // Already exists in the organization: just add it to the types.
        }
        for (const t of usedTargetTypes) {
          try {
            await addFieldToWit(cred, proc.typeId, await editable(t), ref);
          } catch {
            // Already on the type.
          }
        }
        return { status: 'ok' as const, targetId: ref };
      },
    });
    m.fields[key] = ref;
  }
  await api.phase('Adding fields to the target process', fieldTasks, 1);
  return m;
}
