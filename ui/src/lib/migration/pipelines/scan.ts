/**
 * Collects everything a set of pipeline definitions depends on, so the
 * Map step can show one table per resource type before anything is written.
 */

import type { Json } from './rewrite';

export interface PipelineDeps {
  queues: Map<number, string>;
  /** Possible service connection GUIDs (confirmed against the source's list later). */
  guids: Set<string>;
  variableGroups: Set<number>;
  taskGroups: Set<string>;
  repos: Map<string, string>;
  tasks: Set<string>;
  deploymentGroups: Set<number>;
  buildDefinitions: Set<number>;
  approvers: Map<string, string>;
}

const GUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function emptyDeps(): PipelineDeps {
  return {
    queues: new Map(),
    guids: new Set(),
    variableGroups: new Set(),
    taskGroups: new Set(),
    repos: new Map(),
    tasks: new Set(),
    deploymentGroups: new Set(),
    buildDefinitions: new Set(),
    approvers: new Map(),
  };
}

function collectGuids(node: unknown, into: Set<string>) {
  if (typeof node === 'string') {
    for (const m of node.matchAll(GUID_G)) into.add(m[0].toLowerCase());
  } else if (Array.isArray(node)) node.forEach((n) => collectGuids(n, into));
  else if (node && typeof node === 'object')
    Object.values(node).forEach((n) => collectGuids(n, into));
}

function steps(list: Json[] | undefined, idKey: 'task' | 'taskId', deps: PipelineDeps) {
  for (const s of list ?? []) {
    const id = String(idKey === 'task' ? (s.task as Json | undefined)?.id : s.taskId).toLowerCase();
    const type = String(
      idKey === 'task' ? (s.task as Json | undefined)?.definitionType : s.definitionType,
    );
    if (type === 'metaTask') deps.taskGroups.add(id);
    else deps.tasks.add(id);
    collectGuids(s.inputs, deps.guids);
  }
}

export function scanBuild(def: Json, deps: PipelineDeps) {
  const q = def.queue as Json | undefined;
  if (q && typeof q.id === 'number') deps.queues.set(q.id, String(q.name ?? q.id));
  for (const g of (def.variableGroups as Json[] | undefined) ?? [])
    deps.variableGroups.add(Number(g.id));
  const repo = def.repository as Json | undefined;
  if (repo?.type === 'TfsGit') deps.repos.set(String(repo.id), String(repo.name));
  if (repo?.properties) collectGuids(repo.properties, deps.guids);
  const process = def.process as Json | undefined;
  for (const phase of (process?.phases as Json[] | undefined) ?? []) {
    const tq = (phase.target as Json | undefined)?.queue as Json | undefined;
    if (tq && typeof tq.id === 'number') deps.queues.set(tq.id, String(tq.name ?? tq.id));
    steps(phase.steps as Json[] | undefined, 'task', deps);
  }
}

export function scanTaskGroup(group: Json, deps: PipelineDeps) {
  steps(group.tasks as Json[] | undefined, 'task', deps);
}

export function scanRelease(def: Json, deps: PipelineDeps) {
  for (const id of (def.variableGroups as number[] | undefined) ?? [])
    deps.variableGroups.add(Number(id));
  for (const art of (def.artifacts as Json[] | undefined) ?? []) {
    const ref = (art.definitionReference ?? {}) as Record<string, Json>;
    if (art.type === 'Build') deps.buildDefinitions.add(Number(ref.definition?.id));
    if (art.type === 'Git')
      deps.repos.set(String(ref.definition?.id), String(ref.definition?.name ?? ''));
  }
  for (const env of (def.environments as Json[] | undefined) ?? []) {
    for (const id of (env.variableGroups as number[] | undefined) ?? [])
      deps.variableGroups.add(Number(id));
    for (const key of ['preDeployApprovals', 'postDeployApprovals']) {
      for (const a of ((env[key] as Json | undefined)?.approvals as Json[] | undefined) ?? []) {
        const who = a.approver as Json | undefined;
        if (!a.isAutomated && who?.id)
          deps.approvers.set(String(who.id), String(who.uniqueName ?? who.displayName ?? who.id));
      }
    }
    for (const phase of (env.deployPhases as Json[] | undefined) ?? []) {
      const input = (phase.deploymentInput ?? {}) as Json;
      if (
        phase.phaseType === 'agentBasedDeployment' &&
        typeof input.queueId === 'number' &&
        input.queueId > 0
      ) {
        deps.queues.set(input.queueId, `queue ${input.queueId}`);
      }
      if (phase.phaseType === 'machineGroupBasedDeployment' && typeof input.queueId === 'number') {
        deps.deploymentGroups.add(input.queueId);
      }
      steps(phase.workflowTasks as Json[] | undefined, 'taskId', deps);
    }
    collectGuids(env.preDeploymentGates, deps.guids);
    collectGuids(env.postDeploymentGates, deps.guids);
  }
}

/** Order task groups so nested ones are created before the groups that use them. */
export function orderTaskGroups(groups: Json[]): Json[] {
  const byId = new Map(groups.map((g) => [String(g.id).toLowerCase(), g]));
  const done = new Set<string>();
  const out: Json[] = [];
  const visit = (g: Json, stack: Set<string>) => {
    const id = String(g.id).toLowerCase();
    if (done.has(id) || stack.has(id)) return;
    stack.add(id);
    for (const s of (g.tasks as Json[] | undefined) ?? []) {
      const t = s.task as Json | undefined;
      if (t?.definitionType === 'metaTask') {
        const child = byId.get(String(t.id).toLowerCase());
        if (child) visit(child, stack);
      }
    }
    stack.delete(id);
    done.add(id);
    out.push(g);
  };
  for (const g of groups) visit(g, new Set());
  return out;
}

/**
 * Best-effort list of deployment environments named in a YAML file:
 * `environment: name`, `environment: name.resource`, or `environment:\n  name: x`.
 */
export function yamlEnvironments(yaml: string): string[] {
  const names = new Set<string>();
  const lines = yaml.split(/\r?\n/);
  lines.forEach((line, i) => {
    const inline = /^\s*-?\s*environment:\s*['"]?([^'"#\s][^'"#]*?)['"]?\s*(#.*)?$/.exec(line);
    if (inline) {
      names.add(inline[1]!.split('.')[0]!.trim());
      return;
    }
    if (/^\s*-?\s*environment:\s*(#.*)?$/.test(line)) {
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        const m = /^\s*name:\s*['"]?([^'"#\s][^'"#]*?)['"]?\s*(#.*)?$/.exec(lines[j]!);
        if (m) {
          names.add(m[1]!.trim());
          break;
        }
      }
    }
  });
  return [...names].filter((n) => n && !n.includes('$'));
}
