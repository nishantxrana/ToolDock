import type { PatchOp, WitField, WitType } from '@/lib/api/migrate/wit';
import { escapeHtml, migrationFooter } from './html';
import {
  APPEND,
  CREATE,
  UNMAPPED,
  type BoardsMapping,
  type NormalizedItem,
  type PersonRef,
  type SourceField,
  type SourceType,
} from './types';

/** Common Jira and ADO type names and where they usually land. */
const TYPE_DEFAULTS: Record<string, string[]> = {
  story: ['User Story', 'Product Backlog Item', 'Requirement', 'Issue'],
  'user story': ['User Story', 'Product Backlog Item', 'Requirement', 'Issue'],
  'product backlog item': ['Product Backlog Item', 'User Story', 'Requirement', 'Issue'],
  requirement: ['Requirement', 'User Story', 'Product Backlog Item', 'Issue'],
  bug: ['Bug', 'Issue'],
  defect: ['Bug', 'Issue'],
  task: ['Task'],
  'sub-task': ['Task'],
  subtask: ['Task'],
  epic: ['Epic'],
  feature: ['Feature', 'Epic'],
  'new feature': ['Feature', 'User Story', 'Product Backlog Item', 'Issue'],
  improvement: ['User Story', 'Product Backlog Item', 'Issue'],
  issue: ['Issue', 'Bug', 'Task'],
  impediment: ['Impediment', 'Issue'],
};

export function autoTypes(source: SourceType[], target: WitType[]): Record<string, string> {
  const names = new Map(target.map((t) => [t.name.toLowerCase(), t.name]));
  const out: Record<string, string> = {};
  for (const s of source) {
    const key = s.name.toLowerCase();
    out[s.name] =
      names.get(key) ??
      (TYPE_DEFAULTS[key] ?? []).map((n) => names.get(n.toLowerCase())).find(Boolean) ??
      UNMAPPED;
  }
  return out;
}

/** Jira status categories → Azure DevOps state categories. */
export const JIRA_CATEGORY: Record<string, string> = {
  new: 'Proposed',
  indeterminate: 'InProgress',
  done: 'Completed',
};

/** When the target has no state in a category, the closest categories to try instead. */
const NEAREST_CATEGORY: Record<string, string[]> = {
  Proposed: ['Proposed', 'InProgress'],
  InProgress: ['InProgress', 'Resolved', 'Proposed'],
  Resolved: ['Resolved', 'Completed', 'InProgress'],
  Completed: ['Completed', 'Resolved'],
  Removed: ['Removed', 'Completed'],
};

export function autoStates(
  source: SourceType['states'],
  target: WitType | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  const states = target?.states ?? [];
  for (const s of source) {
    const byName = states.find((t) => t.name.toLowerCase() === s.name.toLowerCase());
    const byCategory = (NEAREST_CATEGORY[s.category ?? ''] ?? [])
      .map((c) => states.find((t) => t.category === c))
      .find(Boolean);
    out[s.name] = (byName ?? byCategory ?? states[0])?.name ?? UNMAPPED;
  }
  return out;
}

/** Field types that can safely receive a value of the source type. */
function compatible(source: string, target: string): boolean {
  const s = source.toLowerCase();
  const t = target.toLowerCase();
  if (s === t) return true;
  if (t === 'string' || t === 'plaintext' || t === 'html') return s !== 'identity';
  if ((t === 'integer' || t === 'double') && (s === 'integer' || s === 'double' || s === 'number'))
    return true;
  return false;
}

export function autoFields(source: SourceField[], target: WitField[]): Record<string, string> {
  const byRef = new Map(target.map((f) => [f.referenceName.toLowerCase(), f]));
  const byName = new Map(target.map((f) => [f.name.toLowerCase(), f]));
  const out: Record<string, string> = {};
  for (const f of source) {
    const t = byRef.get(f.key.toLowerCase()) ?? byName.get(f.name.toLowerCase());
    out[f.key] = t && !t.readOnly && compatible(f.type, t.type) ? t.referenceName : APPEND;
  }
  return out;
}

/** Jira priority names → Azure DevOps Priority 1..4. */
export function autoPriorities(names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of names) {
    const k = n.toLowerCase();
    out[n] = /highest|blocker|critical|urgent/.test(k)
      ? '1'
      : /high|major/.test(k)
        ? '2'
        : /lowest|trivial/.test(k)
          ? '4'
          : /low|minor/.test(k)
            ? '4'
            : '3';
  }
  return out;
}

export function personKey(p: PersonRef): string {
  return (p.uniqueName ?? p.displayName).toLowerCase();
}

/** Match people by email/UPN, then by display name. */
export function autoUsers(
  people: PersonRef[],
  members: { displayName: string; uniqueName: string }[],
): Record<string, string> {
  const byUnique = new Map(members.map((m) => [m.uniqueName.toLowerCase(), m.uniqueName]));
  const byName = new Map(members.map((m) => [m.displayName.toLowerCase(), m.uniqueName]));
  const out: Record<string, string> = {};
  for (const p of people) {
    out[personKey(p)] =
      (p.uniqueName && byUnique.get(p.uniqueName.toLowerCase())) ||
      byName.get(p.displayName.toLowerCase()) ||
      UNMAPPED;
  }
  return out;
}

export function joinPath(root: string, prefix: string, segments: string[] | undefined): string {
  const parts = [
    root,
    ...prefix
      .split('\\')
      .map((p) => p.trim())
      .filter(Boolean),
    ...(segments ?? []),
  ];
  return parts.join('\\');
}

/** Coerce a value for the target field's type; undefined means "can't". */
export function coerce(value: unknown, type: string): unknown {
  if (value === null || value === undefined || value === '') return undefined;
  switch (type.toLowerCase()) {
    case 'integer': {
      const n = typeof value === 'number' ? value : Number(String(value));
      return Number.isFinite(n) ? Math.round(n) : undefined;
    }
    case 'double': {
      const n = typeof value === 'number' ? value : Number(String(value));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'boolean':
      return value === true || String(value).toLowerCase() === 'true';
    case 'datetime': {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
    }
    case 'string':
      return display(value).slice(0, 255);
    default:
      return display(value);
  }
}

/** Readable text for any field value (objects from Jira, identity refs, arrays). */
export function display(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(display).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return String(o.displayName ?? o.name ?? o.value ?? o.key ?? JSON.stringify(o));
  }
  return String(value);
}

export interface PatchContext {
  targetProject: string;
  targetType: WitType;
  /** Target fields by reference name (type, read-only…). */
  targetFields: Map<string, WitField>;
  sourceFields: Map<string, SourceField>;
  mapping: BoardsMapping;
  bypassRules: boolean;
  /** HTML per source field key, with images already re-uploaded. */
  html: Record<string, string>;
}

export interface CreatePlan {
  patch: PatchOp[];
  /** State to move to after creating, when it can't be set on create. */
  stateAfter?: string;
  footer: [string, string][];
}

const DESCRIPTION = 'System.Description';
const SKIP_ON_CREATE = new Set([
  'System.State',
  'System.Reason',
  'System.Title',
  'System.AreaPath',
  'System.IterationPath',
  'System.Tags',
  'System.CreatedDate',
  'System.CreatedBy',
  'System.ChangedDate',
  'System.ChangedBy',
]);

/** The JSON Patch to create one item in the target, plus its footer. */
export function buildCreatePatch(item: NormalizedItem, ctx: PatchContext): CreatePlan {
  const m = ctx.mapping;
  const patch: PatchOp[] = [];
  const add = (path: string, value: unknown) => patch.push({ op: 'add', path, value });
  const footer: [string, string][] = [['Source', item.sourceUrl]];
  const onType = new Set((ctx.targetType.fields ?? []).map((f) => f.referenceName));
  const typeOk = (ref: string) => onType.size === 0 || onType.has(ref);

  const title =
    (m.titlePrefix ? `[${item.sourceKey}] ${item.title}` : item.title).slice(0, 255) ||
    item.sourceKey;
  add('/fields/System.Title', title);

  const targetState = m.states[item.type]?.[item.state];
  const states = ctx.targetType.states ?? [];
  const validState =
    targetState && targetState !== UNMAPPED && targetState !== CREATE ? targetState : undefined;
  let stateAfter: string | undefined;
  if (validState) {
    if (ctx.bypassRules) add('/fields/System.State', validState);
    else if (states[0] && validState !== states[0].name) stateAfter = validState;
  }
  if (item.state && (!validState || validState !== item.state))
    footer.push(['Original state', item.state]);

  add('/fields/System.AreaPath', joinPath(ctx.targetProject, m.areaPrefix, item.areaPath));
  add(
    '/fields/System.IterationPath',
    joinPath(ctx.targetProject, m.iterationPrefix, item.iterationPath),
  );

  const tags = [...item.tags, ...(m.tag ? [m.tag] : [])]
    .map((t) => t.replace(/;/g, ',').trim())
    .filter(Boolean);
  if (tags.length) add('/fields/System.Tags', [...new Set(tags)].join('; '));

  if (m.keepCreated && ctx.bypassRules) {
    // Jira sends offsets like +0000, which Azure DevOps may not accept: send strict ISO.
    const created = item.createdAt ? coerce(item.createdAt, 'dateTime') : undefined;
    if (created) add('/fields/System.CreatedDate', created);
    if (item.createdBy && m.users.enabled) {
      const to = m.users.map[item.createdBy.toLowerCase()];
      if (to && to !== UNMAPPED) add('/fields/System.CreatedBy', to);
    }
  }
  if (item.createdAt)
    footer.push([
      'Created',
      `${new Date(item.createdAt).toLocaleString()}${item.createdBy ? ` by ${item.createdBy}` : ''}`,
    ]);

  // People: mapped only when user mapping is on; otherwise kept as text in the footer.
  for (const [key, person] of Object.entries(item.people)) {
    const fieldName = ctx.sourceFields.get(key)?.name ?? key;
    const target = m.fields[key];
    const to = m.users.enabled ? m.users.map[personKey(person)] : undefined;
    if (
      to &&
      to !== UNMAPPED &&
      target &&
      target !== APPEND &&
      target !== UNMAPPED &&
      typeOk(target)
    ) {
      add(`/fields/${target}`, to);
    } else {
      footer.push([
        `Original ${fieldName.toLowerCase()}`,
        person.uniqueName ? `${person.displayName} <${person.uniqueName}>` : person.displayName,
      ]);
    }
  }

  // Plain fields.
  for (const [key, raw] of Object.entries(item.fields)) {
    const target = m.fields[key] ?? APPEND;
    const name = ctx.sourceFields.get(key)?.name ?? key;
    if (target === UNMAPPED) continue;
    const valueMap = m.values[key];
    const mappedRaw = valueMap ? (valueMap[display(raw)] ?? raw) : raw;
    const tf = ctx.targetFields.get(target);
    if (target === APPEND || !tf || tf.readOnly || SKIP_ON_CREATE.has(target) || !typeOk(target)) {
      const text = display(raw);
      if (text) footer.push([name, text]);
      continue;
    }
    const v = coerce(mappedRaw, tf.type);
    if (v === undefined) {
      const text = display(raw);
      if (text) footer.push([name, text]);
    } else add(`/fields/${target}`, v);
  }

  // Rich text: mapped fields get their HTML; the footer goes at the end of the description.
  let descriptionTarget = DESCRIPTION;
  const htmlOut = new Map<string, string>();
  for (const [key, value] of Object.entries(ctx.html)) {
    const target = m.fields[key] ?? (key === DESCRIPTION ? DESCRIPTION : APPEND);
    if (target === UNMAPPED || !value) continue;
    if (target === APPEND || !typeOk(target)) {
      const name = ctx.sourceFields.get(key)?.name ?? key;
      htmlOut.set(
        DESCRIPTION,
        `${htmlOut.get(DESCRIPTION) ?? ''}<h3>${escapeHtml(name)}</h3>${value}`,
      );
    } else {
      htmlOut.set(target, `${htmlOut.get(target) ?? ''}${value}`);
    }
  }
  if (!typeOk(DESCRIPTION)) {
    // Bugs and some custom types keep their main text in Repro Steps.
    descriptionTarget = typeOk('Microsoft.VSTS.TCM.ReproSteps')
      ? 'Microsoft.VSTS.TCM.ReproSteps'
      : DESCRIPTION;
  }
  const footerHtml = migrationFooter(footer);
  htmlOut.set(descriptionTarget, `${htmlOut.get(descriptionTarget) ?? ''}${footerHtml}`);
  if (descriptionTarget !== DESCRIPTION && htmlOut.has(DESCRIPTION)) {
    htmlOut.set(descriptionTarget, `${htmlOut.get(DESCRIPTION)}${htmlOut.get(descriptionTarget)}`);
    htmlOut.delete(DESCRIPTION);
  }
  for (const [ref, html] of htmlOut) add(`/fields/${ref}`, html);

  if (m.sourceIdField && m.sourceIdField !== UNMAPPED && typeOk(m.sourceIdField)) {
    add(`/fields/${m.sourceIdField}`, item.sourceKey);
  }
  if (m.hyperlinkBack) {
    patch.push({
      op: 'add',
      path: '/relations/-',
      value: { rel: 'Hyperlink', url: item.sourceUrl, attributes: { comment: 'Migrated from' } },
    });
  }
  for (const url of item.hyperlinks) {
    patch.push({ op: 'add', path: '/relations/-', value: { rel: 'Hyperlink', url } });
  }
  return { patch, stateAfter, footer };
}

/** A smaller patch for a retry after Azure DevOps rejected a field value. */
export function minimalPatch(plan: CreatePlan): PatchOp[] {
  const keep =
    /^\/fields\/(System\.(Title|AreaPath|IterationPath|Tags|State|Description|CreatedDate|CreatedBy)|Microsoft\.VSTS\.TCM\.ReproSteps)$|^\/relations\//;
  return plan.patch.filter((p) => keep.test(p.path));
}
