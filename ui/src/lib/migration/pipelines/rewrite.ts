/**
 * Pure functions that turn a pipeline definition read from the source into a
 * create body for the target. Everything that refers to a source-only thing
 * (agent queue, service connection, variable group, task group, repository,
 * build definition, deployment group, people) is mapped or removed, and every
 * removal is returned as a note so it can go into the migration report.
 */

export type Json = Record<string, unknown>;

export interface IdMaps {
  /** Agent queue id → target queue id. */
  queues: Map<number, number>;
  /** Service connection id (lower-case GUID) → target id, or '' when there's no match. */
  endpoints: Map<string, string>;
  /** Variable group id → target id. */
  variableGroups: Map<number, number>;
  /** Task group id (lower-case GUID) → target id. */
  taskGroups: Map<string, string>;
  /** Repository id → target repo. */
  repos: Map<string, { id: string; name: string; url?: string }>;
  /** Build definition id → target id (for release artifacts). */
  builds: Map<number, number>;
  /** Deployment group id → target id. */
  deploymentGroups: Map<number, number>;
  /** Task ids missing in the target (lower-case GUID). */
  missingTasks: Set<string>;
  /** Source user id → target user id, when user mapping is on. */
  users?: Map<string, string>;
}

export interface RewriteNote {
  kind:
    | 'secret'
    | 'endpoint'
    | 'queue'
    | 'variableGroup'
    | 'taskGroup'
    | 'repository'
    | 'artifact'
    | 'deploymentGroup'
    | 'approver'
    | 'missingTask'
    | 'owner';
  detail: string;
}

export interface RewriteContext {
  maps: IdMaps;
  target: { projectId: string; projectName: string };
  /** What to do with a step whose task isn't installed in the target. */
  missingTaskMode: 'block' | 'disable';
  /** Identity that owns release stages in the target (the token's user). */
  ownerId?: string;
}

export interface RewriteResult {
  body: Json;
  notes: RewriteNote[];
  /** Set when the definition can't be created (e.g. missing tasks in block mode). */
  blocked?: string;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const READ_ONLY_KEYS = [
  'id',
  'revision',
  'url',
  '_links',
  'uri',
  'createdBy',
  'createdOn',
  'createdDate',
  'modifiedBy',
  'modifiedOn',
  'authoredBy',
  'project',
  'queueStatus',
  'latestBuild',
  'latestCompletedBuild',
  'metrics',
  'badgeUrl',
  'lastRelease',
  'isDeleted',
];

function stripReadOnly(o: Json) {
  for (const k of READ_ONLY_KEYS) delete o[k];
}

/**
 * Replace service connection and task group GUIDs anywhere in the tree (task
 * inputs, gates, repository properties…). A value can be one GUID or a
 * comma-separated list.
 */
export function replaceGuids(
  node: unknown,
  maps: IdMaps,
  notes: RewriteNote[],
  where: string,
): unknown {
  if (typeof node === 'string') {
    if (!node.includes('-')) return node;
    const parts = node.split(',').map((p) => p.trim());
    if (!parts.every((p) => GUID.test(p))) return node;
    let changed = false;
    const out = parts.map((p) => {
      const key = p.toLowerCase();
      if (maps.endpoints.has(key)) {
        changed = true;
        const to = maps.endpoints.get(key)!;
        if (!to)
          notes.push({
            kind: 'endpoint',
            detail: `${where ? `${where}: ` : ''}a service connection has no match in the target and was cleared`,
          });
        return to;
      }
      if (maps.taskGroups.has(key)) {
        changed = true;
        return maps.taskGroups.get(key)!;
      }
      return p;
    });
    return changed ? out.filter(Boolean).join(',') : node;
  }
  if (Array.isArray(node)) return node.map((n) => replaceGuids(n, maps, notes, where));
  if (node && typeof node === 'object') {
    const o = node as Json;
    for (const k of Object.keys(o)) o[k] = replaceGuids(o[k], maps, notes, where);
    return o;
  }
  return node;
}

/** Secret variables come back with value null; create them empty and note each one. */
function rewriteVariables(vars: unknown, where: string, notes: RewriteNote[]) {
  if (!vars || typeof vars !== 'object') return vars;
  const out: Json = {};
  for (const [name, raw] of Object.entries(vars as Record<string, Json>)) {
    const v = { ...(raw ?? {}) } as Json;
    if (v.isSecret) {
      v.value = '';
      notes.push({ kind: 'secret', detail: `${name}${where ? ` (${where})` : ''}` });
    }
    out[name] = v;
  }
  return out;
}

function mapQueue(
  queue: Json | undefined,
  ctx: RewriteContext,
  notes: RewriteNote[],
  where: string,
): Json | undefined {
  if (!queue || typeof queue.id !== 'number') return queue;
  const to = ctx.maps.queues.get(queue.id);
  if (to === undefined) {
    notes.push({
      kind: 'queue',
      detail: `${where}: agent pool "${String(queue.name ?? queue.id)}" has no match in the target`,
    });
    return undefined;
  }
  return { id: to };
}

/** Task steps (build phases, task groups, release workflow tasks) share this. */
function rewriteSteps(
  steps: Json[] | undefined,
  idKey: 'task' | 'taskId',
  ctx: RewriteContext,
  notes: RewriteNote[],
  where: string,
): string[] {
  const missing: string[] = [];
  for (const step of steps ?? []) {
    const ref = idKey === 'task' ? (step.task as Json | undefined) : step;
    const id = String((idKey === 'task' ? ref?.id : step.taskId) ?? '').toLowerCase();
    const type = String((idKey === 'task' ? ref?.definitionType : step.definitionType) ?? 'task');
    const name = String(step.displayName ?? step.name ?? id);
    if (type === 'metaTask') {
      const to = ctx.maps.taskGroups.get(id);
      if (!to) {
        notes.push({
          kind: 'taskGroup',
          detail: `${where}: task group step "${name}" has no match; the step was disabled`,
        });
        step.enabled = false;
      } else if (idKey === 'task' && ref) ref.id = to;
      else step.taskId = to;
    } else if (ctx.maps.missingTasks.has(id)) {
      missing.push(name);
      if (ctx.missingTaskMode === 'disable') step.enabled = false;
    }
  }
  return missing;
}

export function rewriteBuildDefinition(def: Json, ctx: RewriteContext): RewriteResult {
  const body = clone(def);
  const notes: RewriteNote[] = [];
  stripReadOnly(body);
  delete body.queueStatus;

  body.variables = rewriteVariables(body.variables, '', notes);

  // Variable groups
  if (Array.isArray(body.variableGroups)) {
    body.variableGroups = (body.variableGroups as Json[])
      .map((g) => {
        const to = ctx.maps.variableGroups.get(Number(g.id));
        if (to === undefined) {
          notes.push({
            kind: 'variableGroup',
            detail: `variable group "${String(g.name ?? g.id)}" has no match in the target`,
          });
          return null;
        }
        return { id: to };
      })
      .filter(Boolean);
  }

  // Default queue
  const queue = mapQueue(body.queue as Json | undefined, ctx, notes, 'default agent pool');
  if (queue) body.queue = queue;
  else delete body.queue;

  // Repository
  const repo = body.repository as Json | undefined;
  if (repo && repo.type === 'TfsGit') {
    const to = ctx.maps.repos.get(String(repo.id));
    if (!to) {
      notes.push({
        kind: 'repository',
        detail: `repository "${String(repo.name)}" has no match in the target`,
      });
      return {
        body,
        notes,
        blocked: `The repository "${String(repo.name)}" doesn't exist in the target. Migrate it first or map it.`,
      };
    }
    repo.id = to.id;
    repo.name = to.name;
    if (to.url) repo.url = to.url;
    else delete repo.url;
  }

  // Classic phases
  const process = body.process as Json | undefined;
  const missing: string[] = [];
  if (process && Number(process.type) === 1) {
    for (const phase of (process.phases as Json[] | undefined) ?? []) {
      const target = phase.target as Json | undefined;
      if (target?.queue) {
        const q = mapQueue(target.queue as Json, ctx, notes, `phase "${String(phase.name ?? '')}"`);
        if (q) target.queue = q;
        else delete target.queue;
      }
      missing.push(
        ...rewriteSteps(
          phase.steps as Json[] | undefined,
          'task',
          ctx,
          notes,
          `phase "${String(phase.name ?? '')}"`,
        ),
      );
    }
  }

  replaceGuids(body, ctx.maps, notes, '');

  for (const m of missing)
    notes.push({
      kind: 'missingTask',
      detail: `step "${m}" uses a task that isn't installed in the target`,
    });
  if (missing.length > 0 && ctx.missingTaskMode === 'block') {
    return {
      body,
      notes,
      blocked: `Uses ${missing.length} task${missing.length === 1 ? '' : 's'} not installed in the target: ${missing.join(', ')}.`,
    };
  }
  return { body, notes };
}

export function rewriteTaskGroup(group: Json, ctx: RewriteContext): RewriteResult {
  const body = clone(group);
  const notes: RewriteNote[] = [];
  for (const k of [
    'id',
    'revision',
    'createdBy',
    'createdOn',
    'modifiedBy',
    'modifiedOn',
    'owner',
    'contentsUploaded',
    'deleted',
    'parentDefinitionId',
    '_buildConfigMapping',
    'preview',
    'definitionType',
  ]) {
    delete body[k];
  }
  const missing = rewriteSteps(
    body.tasks as Json[] | undefined,
    'task',
    ctx,
    notes,
    `task group "${String(body.name)}"`,
  );
  replaceGuids(body, ctx.maps, notes, '');
  for (const m of missing)
    notes.push({
      kind: 'missingTask',
      detail: `step "${m}" uses a task that isn't installed in the target`,
    });
  if (missing.length > 0 && ctx.missingTaskMode === 'block') {
    return {
      body,
      notes,
      blocked: `Uses tasks not installed in the target: ${missing.join(', ')}.`,
    };
  }
  return { body, notes };
}

interface Approver {
  displayName?: string;
  uniqueName?: string;
  id?: string;
}

function rewriteApprovals(
  env: Json,
  key: 'preDeployApprovals' | 'postDeployApprovals',
  ctx: RewriteContext,
  notes: RewriteNote[],
) {
  const block = env[key] as Json | undefined;
  const approvals = (block?.approvals as Json[] | undefined) ?? [];
  const people = approvals.filter((a) => !a.isAutomated && a.approver);
  if (people.length === 0) {
    if (block)
      block.approvals = approvals.map((a) => ({
        rank: a.rank ?? 1,
        isAutomated: true,
        isNotificationOn: false,
      }));
    return;
  }
  const mapped = people.map((a) => {
    const who = a.approver as Approver;
    const to = who.id ? ctx.maps.users?.get(who.id) : undefined;
    return { a, who, to };
  });
  if (ctx.maps.users && mapped.every((m) => m.to)) {
    block!.approvals = mapped.map(({ a, to }, i) => ({
      rank: a.rank ?? i + 1,
      isAutomated: false,
      isNotificationOn: a.isNotificationOn ?? false,
      approver: { id: to },
    }));
    return;
  }
  const names = mapped.map((m) => m.who.displayName ?? m.who.uniqueName ?? 'someone').join(', ');
  notes.push({
    kind: 'approver',
    detail: `stage "${String(env.name)}" ${key === 'preDeployApprovals' ? 'pre' : 'post'}-deployment approvers (${names}) were removed; the stage now deploys without approval`,
  });
  block!.approvals = [{ rank: 1, isAutomated: true, isNotificationOn: false }];
}

export function rewriteReleaseDefinition(def: Json, ctx: RewriteContext): RewriteResult {
  const body = clone(def);
  const notes: RewriteNote[] = [];
  stripReadOnly(body);

  body.variables = rewriteVariables(body.variables, '', notes);
  body.variableGroups = mapGroupIds(body.variableGroups, ctx, notes, 'release');

  // Artifacts
  const artifacts = ((body.artifacts as Json[] | undefined) ?? []).map((art) => {
    const ref = (art.definitionReference ?? {}) as Record<string, Json>;
    if (art.type === 'Build') {
      const srcId = Number(ref.definition?.id);
      const to = ctx.maps.builds.get(srcId);
      if (to === undefined) {
        notes.push({
          kind: 'artifact',
          detail: `build artifact "${String(art.alias)}" points at a pipeline that isn't in the target; it was removed`,
        });
        return null;
      }
      ref.definition = { id: String(to), name: ref.definition?.name ?? '' } as Json;
      ref.project = { id: ctx.target.projectId, name: ctx.target.projectName } as Json;
      art.sourceId = `${ctx.target.projectId}:${to}`;
    } else if (art.type === 'Git') {
      const srcRepo = String(ref.definition?.id ?? '');
      const to = ctx.maps.repos.get(srcRepo);
      if (!to) {
        notes.push({
          kind: 'artifact',
          detail: `Git artifact "${String(art.alias)}" points at a repo that isn't in the target; it was removed`,
        });
        return null;
      }
      ref.definition = { id: to.id, name: to.name } as Json;
      ref.project = { id: ctx.target.projectId, name: ctx.target.projectName } as Json;
      art.sourceId = `${ctx.target.projectId}:${to.id}`;
    } else {
      notes.push({
        kind: 'artifact',
        detail: `${String(art.type)} artifact "${String(art.alias)}" was copied as is; check its service connection`,
      });
    }
    art.definitionReference = ref;
    delete art.id;
    return art;
  });
  body.artifacts = artifacts.filter(Boolean);
  const aliases = new Set((body.artifacts as Json[]).map((a) => String(a.alias)));
  body.triggers = ((body.triggers as Json[] | undefined) ?? []).filter(
    (t) => !t.artifactAlias || aliases.has(String(t.artifactAlias)),
  );

  // Stages
  const missing: string[] = [];
  for (const env of (body.environments as Json[] | undefined) ?? []) {
    const stage = `stage "${String(env.name)}"`;
    delete env.id;
    delete env.badgeUrl;
    delete env.currentRelease;
    if (ctx.ownerId) env.owner = { id: ctx.ownerId };
    else {
      delete env.owner;
      notes.push({ kind: 'owner', detail: `${stage}: owner left empty` });
    }
    env.variables = rewriteVariables(env.variables, stage, notes);
    env.variableGroups = mapGroupIds(env.variableGroups, ctx, notes, stage);
    rewriteApprovals(env, 'preDeployApprovals', ctx, notes);
    rewriteApprovals(env, 'postDeployApprovals', ctx, notes);
    for (const a of ['preDeployApprovals', 'postDeployApprovals'] as const) {
      const block = env[a] as Json | undefined;
      for (const ap of (block?.approvals as Json[] | undefined) ?? []) delete ap.id;
    }
    for (const phase of (env.deployPhases as Json[] | undefined) ?? []) {
      const input = (phase.deploymentInput ?? {}) as Json;
      const phaseName = `${stage} / ${String(phase.name ?? 'job')}`;
      if (
        phase.phaseType === 'agentBasedDeployment' &&
        typeof input.queueId === 'number' &&
        input.queueId > 0
      ) {
        const to = ctx.maps.queues.get(input.queueId);
        if (to === undefined)
          notes.push({
            kind: 'queue',
            detail: `${phaseName}: agent pool has no match in the target`,
          });
        input.queueId = to ?? 0;
      } else if (
        phase.phaseType === 'machineGroupBasedDeployment' &&
        typeof input.queueId === 'number'
      ) {
        const to = ctx.maps.deploymentGroups.get(input.queueId);
        if (to === undefined)
          notes.push({
            kind: 'deploymentGroup',
            detail: `${phaseName}: deployment group has no match in the target`,
          });
        input.queueId = to ?? 0;
      }
      missing.push(
        ...rewriteSteps(phase.workflowTasks as Json[] | undefined, 'taskId', ctx, notes, phaseName),
      );
    }
  }

  replaceGuids(body, ctx.maps, notes, '');

  for (const m of missing)
    notes.push({
      kind: 'missingTask',
      detail: `step "${m}" uses a task that isn't installed in the target`,
    });
  if (missing.length > 0 && ctx.missingTaskMode === 'block') {
    return {
      body,
      notes,
      blocked: `Uses tasks not installed in the target: ${missing.join(', ')}.`,
    };
  }
  return { body, notes };
}

function mapGroupIds(
  ids: unknown,
  ctx: RewriteContext,
  notes: RewriteNote[],
  where: string,
): number[] {
  if (!Array.isArray(ids)) return [];
  const out: number[] = [];
  for (const id of ids as number[]) {
    const to = ctx.maps.variableGroups.get(Number(id));
    if (to === undefined)
      notes.push({
        kind: 'variableGroup',
        detail: `${where}: variable group ${id} has no match in the target`,
      });
    else out.push(to);
  }
  return out;
}
