import { describe, expect, it } from 'vitest';
import {
  rewriteBuildDefinition,
  rewriteReleaseDefinition,
  rewriteTaskGroup,
  type IdMaps,
  type Json,
  type RewriteContext,
} from '@/lib/migration/pipelines/rewrite';
import {
  emptyDeps,
  orderTaskGroups,
  scanBuild,
  scanRelease,
  yamlEnvironments,
} from '@/lib/migration/pipelines/scan';

const EP_SRC = '11111111-1111-1111-1111-111111111111';
const EP_TGT = '22222222-2222-2222-2222-222222222222';
const EP_MISSING = '33333333-3333-3333-3333-333333333333';
const TG_SRC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TG_TGT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TASK_OK = 'e213ff0f-5d5c-4791-802d-52ea3e7be1f1';
const TASK_MISSING = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const maps = (): IdMaps => ({
  queues: new Map([[10, 100]]),
  endpoints: new Map([
    [EP_SRC, EP_TGT],
    [EP_MISSING, ''],
  ]),
  variableGroups: new Map([[5, 50]]),
  taskGroups: new Map([[TG_SRC, TG_TGT]]),
  repos: new Map([
    ['repo-src', { id: 'repo-tgt', name: 'web', url: 'https://dev.azure.com/b/P2/_git/web' }],
  ]),
  builds: new Map([[7, 70]]),
  deploymentGroups: new Map(),
  missingTasks: new Set([TASK_MISSING]),
});

const ctx = (over: Partial<RewriteContext> = {}): RewriteContext => ({
  maps: maps(),
  target: { projectId: 'p2', projectName: 'P2' },
  missingTaskMode: 'block',
  ownerId: 'owner-1',
  ...over,
});

const classic = (): Json => ({
  id: 3,
  revision: 9,
  name: 'CI',
  path: '\\Apps',
  url: 'https://x',
  _links: {},
  project: { id: 'p1' },
  queue: { id: 10, name: 'Default' },
  variables: { Plain: { value: 'x' }, Secret: { value: null, isSecret: true } },
  variableGroups: [
    { id: 5, name: 'Shared' },
    { id: 6, name: 'Gone' },
  ],
  repository: {
    id: 'repo-src',
    name: 'web',
    type: 'TfsGit',
    url: 'https://dev.azure.com/a/P1/_git/web',
  },
  process: {
    type: 1,
    phases: [
      {
        name: 'Job 1',
        target: { queue: { id: 10 } },
        steps: [
          {
            displayName: 'Deploy',
            task: { id: TASK_OK, definitionType: 'task' },
            inputs: { azureSubscription: EP_SRC },
          },
          {
            displayName: 'Docker',
            task: { id: TASK_OK, definitionType: 'task' },
            inputs: { registry: EP_MISSING },
          },
          {
            displayName: 'Shared steps',
            task: { id: TG_SRC, definitionType: 'metaTask' },
            inputs: {},
          },
        ],
      },
    ],
  },
});

describe('build definition rewrite', () => {
  it('maps every source-only reference and strips read-only fields', () => {
    const r = rewriteBuildDefinition(classic(), ctx());
    expect(r.blocked).toBeUndefined();
    const b = r.body as Json & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(b.id).toBeUndefined();
    expect(b.revision).toBeUndefined();
    expect(b.project).toBeUndefined();
    expect(b.queue).toEqual({ id: 100 });
    expect(b.variableGroups).toEqual([{ id: 50 }]);
    expect(b.repository).toMatchObject({
      id: 'repo-tgt',
      name: 'web',
      url: 'https://dev.azure.com/b/P2/_git/web',
    });
    expect(b.variables.Secret).toEqual({ value: '', isSecret: true });
    expect(b.variables.Plain).toEqual({ value: 'x' });
    const steps = b.process.phases[0].steps;
    expect(b.process.phases[0].target.queue).toEqual({ id: 100 });
    expect(steps[0].inputs.azureSubscription).toBe(EP_TGT);
    expect(steps[1].inputs.registry).toBe('');
    expect(steps[2].task.id).toBe(TG_TGT);
    const kinds = r.notes.map((n) => n.kind).sort();
    expect(kinds).toEqual(['endpoint', 'secret', 'variableGroup']);
  });

  it("blocks a pipeline whose repo isn't in the target", () => {
    const def = classic();
    (def.repository as Json).id = 'unknown';
    expect(rewriteBuildDefinition(def, ctx()).blocked).toMatch(/repository/);
  });

  it('blocks, or disables the step, when a task is missing in the target', () => {
    const def = classic();
    ((def.process as Json).phases as Json[])[0]!.steps = [
      { displayName: 'Lint', task: { id: TASK_MISSING, definitionType: 'task' }, inputs: {} },
    ];
    expect(rewriteBuildDefinition(def, ctx()).blocked).toMatch(/not installed/);
    const r = rewriteBuildDefinition(def, ctx({ missingTaskMode: 'disable' }));
    expect(r.blocked).toBeUndefined();
    expect((((r.body.process as Json).phases as Json[])[0]!.steps as Json[])[0]!.enabled).toBe(
      false,
    );
  });

  it('YAML pipelines keep the file and triggers', () => {
    const r = rewriteBuildDefinition(
      {
        name: 'yaml',
        queue: { id: 10 },
        process: { type: 2, yamlFilename: 'azure-pipelines.yml' },
        repository: { id: 'repo-src', name: 'web', type: 'TfsGit' },
        triggers: [{ triggerType: 'continuousIntegration' }],
      },
      ctx(),
    );
    expect(r.body.process).toEqual({ type: 2, yamlFilename: 'azure-pipelines.yml' });
    expect(r.body.triggers).toEqual([{ triggerType: 'continuousIntegration' }]);
  });

  it("doesn't change the source definition", () => {
    const def = classic();
    const copy = JSON.stringify(def);
    rewriteBuildDefinition(def, ctx());
    expect(JSON.stringify(def)).toBe(copy);
  });
});

describe('task group and release rewrite', () => {
  it('task groups map nested groups and connections', () => {
    const r = rewriteTaskGroup(
      {
        id: TG_SRC,
        name: 'Deploy',
        revision: 3,
        owner: 'x',
        tasks: [{ task: { id: TG_SRC, definitionType: 'metaTask' }, inputs: { c: EP_SRC } }],
      },
      ctx(),
    );
    expect(r.body.id).toBeUndefined();
    expect(r.body.owner).toBeUndefined();
    const t = (r.body.tasks as Json[])[0]!;
    expect((t.task as Json).id).toBe(TG_TGT);
    expect((t.inputs as Json).c).toBe(EP_TGT);
  });

  const release = (): Json => ({
    id: 1,
    name: 'Release',
    variables: { S: { value: null, isSecret: true } },
    variableGroups: [5],
    artifacts: [
      {
        alias: '_CI',
        type: 'Build',
        definitionReference: {
          definition: { id: '7', name: 'CI' },
          project: { id: 'p1', name: 'P1' },
        },
      },
      {
        alias: '_Old',
        type: 'Build',
        definitionReference: { definition: { id: '8', name: 'Old' }, project: { id: 'p1' } },
      },
    ],
    triggers: [{ artifactAlias: '_CI' }, { artifactAlias: '_Old' }],
    environments: [
      {
        id: 4,
        name: 'Prod',
        owner: { id: 'someone-else' },
        variableGroups: [5, 9],
        preDeployApprovals: {
          approvals: [
            { id: 1, rank: 1, isAutomated: false, approver: { id: 'u1', displayName: 'Ana' } },
          ],
        },
        postDeployApprovals: { approvals: [{ id: 2, rank: 1, isAutomated: true }] },
        deployPhases: [
          {
            name: 'Agent job',
            phaseType: 'agentBasedDeployment',
            deploymentInput: { queueId: 10 },
            workflowTasks: [
              {
                name: 'Deploy',
                taskId: TASK_OK,
                definitionType: 'task',
                inputs: { ConnectedServiceName: EP_SRC },
              },
            ],
          },
          {
            name: 'Servers',
            phaseType: 'machineGroupBasedDeployment',
            deploymentInput: { queueId: 42 },
            workflowTasks: [],
          },
        ],
      },
    ],
  });

  it('maps artifacts, stages, queues and connections; approvers become automatic', () => {
    const r = rewriteReleaseDefinition(release(), ctx());
    const b = r.body as Json & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(b.artifacts).toHaveLength(1);
    expect(b.artifacts[0].definitionReference.definition).toEqual({ id: '70', name: 'CI' });
    expect(b.artifacts[0].definitionReference.project).toEqual({ id: 'p2', name: 'P2' });
    expect(b.artifacts[0].sourceId).toBe('p2:70');
    expect(b.triggers).toEqual([{ artifactAlias: '_CI' }]);
    const env = b.environments[0];
    expect(env.id).toBeUndefined();
    expect(env.owner).toEqual({ id: 'owner-1' });
    expect(env.variableGroups).toEqual([50]);
    expect(env.preDeployApprovals.approvals).toEqual([
      { rank: 1, isAutomated: true, isNotificationOn: false },
    ]);
    expect(env.deployPhases[0].deploymentInput.queueId).toBe(100);
    expect(env.deployPhases[0].workflowTasks[0].inputs.ConnectedServiceName).toBe(EP_TGT);
    expect(env.deployPhases[1].deploymentInput.queueId).toBe(0);
    expect(b.variables.S).toEqual({ value: '', isSecret: true });
    const kinds = new Set(r.notes.map((n) => n.kind));
    for (const k of ['artifact', 'approver', 'deploymentGroup', 'variableGroup', 'secret'])
      expect(kinds.has(k as never)).toBe(true);
  });

  it('keeps approvers when user mapping resolves all of them', () => {
    const m = maps();
    m.users = new Map([['u1', 'u1-target']]);
    const r = rewriteReleaseDefinition(release(), ctx({ maps: m }));
    const env = (r.body.environments as Json[])[0] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(env.preDeployApprovals.approvals).toEqual([
      { rank: 1, isAutomated: false, isNotificationOn: false, approver: { id: 'u1-target' } },
    ]);
  });
});

describe('dependency scan', () => {
  it('collects queues, groups, repos, task groups, tasks and approvers', () => {
    const deps = emptyDeps();
    scanBuild(classic(), deps);
    expect([...deps.queues.keys()]).toEqual([10]);
    expect([...deps.variableGroups]).toEqual([5, 6]);
    expect([...deps.repos]).toEqual([['repo-src', 'web']]);
    expect([...deps.taskGroups]).toEqual([TG_SRC]);
    expect(deps.tasks.has(TASK_OK)).toBe(true);
    expect(deps.guids.has(EP_SRC)).toBe(true);
    scanRelease(
      {
        variableGroups: [9],
        artifacts: [{ type: 'Build', definitionReference: { definition: { id: '7' } } }],
        environments: [
          {
            preDeployApprovals: {
              approvals: [{ isAutomated: false, approver: { id: 'u1', uniqueName: 'ana@x.com' } }],
            },
            deployPhases: [
              { phaseType: 'machineGroupBasedDeployment', deploymentInput: { queueId: 3 } },
            ],
          },
        ],
      },
      deps,
    );
    expect(deps.buildDefinitions.has(7)).toBe(true);
    expect(deps.deploymentGroups.has(3)).toBe(true);
    expect(deps.approvers.get('u1')).toBe('ana@x.com');
  });

  it('orders nested task groups first', () => {
    const outer = { id: 'B', tasks: [{ task: { id: 'a', definitionType: 'metaTask' } }] };
    const inner = { id: 'A', tasks: [] };
    expect(orderTaskGroups([outer, inner]).map((g) => g.id)).toEqual(['A', 'B']);
  });

  it('finds YAML environments', () => {
    const yaml = [
      'stages:',
      '- stage: Prod',
      '  jobs:',
      '  - deployment: Web',
      '    environment: production.web-vm',
      '  - deployment: Api',
      '    environment:',
      '      name: staging',
      '      resourceType: VirtualMachine',
      '  - deployment: Dyn',
      '    environment: $(envName)',
    ].join('\n');
    expect(yamlEnvironments(yaml).sort()).toEqual(['production', 'staging']);
  });
});
