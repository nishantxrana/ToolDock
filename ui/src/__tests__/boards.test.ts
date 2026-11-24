// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  imageUrls,
  migrationFooter,
  replaceImageUrls,
  sanitizeHtml,
} from '@/lib/migration/boards/html';
import {
  autoFields,
  autoPriorities,
  autoStates,
  autoTypes,
  autoUsers,
  buildCreatePatch,
  coerce,
  minimalPatch,
  type PatchContext,
} from '@/lib/migration/boards/mapping';
import { normalizeAdoItem } from '@/lib/migration/boards/readers/ado';
import { absolutizeJiraHtml, normalizeJiraIssue } from '@/lib/migration/boards/readers/jira';
import { neededPaths } from '@/lib/migration/boards/writer';
import {
  APPEND,
  UNMAPPED,
  type BoardsMapping,
  type NormalizedItem,
} from '@/lib/migration/boards/types';
import type { WitField, WitType } from '@/lib/api/migrate/wit';
import type { JiraField } from '@/lib/api/migrate/jira';

describe('rich text', () => {
  it('keeps formatting and removes anything that could run', () => {
    const out = sanitizeHtml(
      '<p onclick="x()">Hi <b>there</b><script>alert(1)</script><img src="javascript:alert(1)"><a href="https://ok.com" style="color:red">link</a><iframe src="https://evil"></iframe><custom-tag>kept text</custom-tag></p>',
    );
    expect(out).not.toMatch(/onclick|script|javascript:|iframe|style=/);
    expect(out).toContain('<b>there</b>');
    expect(out).toContain('<a href="https://ok.com" rel="noreferrer">link</a>');
    expect(out).toContain('kept text');
  });

  it('finds and swaps image sources', () => {
    const html =
      '<p><img src="https://dev.azure.com/a/_apis/wit/attachments/1?fileName=x.png"><img src="https://other/y.png"></p>';
    expect(imageUrls(html)).toHaveLength(2);
    const out = replaceImageUrls(
      html,
      new Map([
        [
          'https://dev.azure.com/a/_apis/wit/attachments/1?fileName=x.png',
          'https://dev.azure.com/b/_apis/wit/attachments/9',
        ],
      ]),
    );
    expect(out).toContain('https://dev.azure.com/b/_apis/wit/attachments/9');
    expect(out).toContain('https://other/y.png');
  });

  it('escapes footer values', () => {
    expect(migrationFooter([['Note', '<b>x</b>']])).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

const targetTypes: WitType[] = [
  {
    name: 'User Story',
    referenceName: 'Microsoft.VSTS.WorkItemTypes.UserStory',
    states: [
      { name: 'New', category: 'Proposed' },
      { name: 'Active', category: 'InProgress' },
      { name: 'Closed', category: 'Completed' },
    ],
    fields: [
      { referenceName: 'System.Title', name: 'Title' },
      { referenceName: 'System.Description', name: 'Description' },
      { referenceName: 'Microsoft.VSTS.Common.Priority', name: 'Priority' },
      { referenceName: 'System.AssignedTo', name: 'Assigned To' },
      { referenceName: 'Microsoft.VSTS.Scheduling.StoryPoints', name: 'Story Points' },
    ],
  },
  {
    name: 'Bug',
    referenceName: 'Microsoft.VSTS.WorkItemTypes.Bug',
    states: [
      { name: 'New', category: 'Proposed' },
      { name: 'Resolved', category: 'Resolved' },
    ],
    fields: [
      { referenceName: 'System.Title', name: 'Title' },
      { referenceName: 'Microsoft.VSTS.TCM.ReproSteps', name: 'Repro Steps' },
    ],
  },
  {
    name: 'Task',
    referenceName: 'Microsoft.VSTS.WorkItemTypes.Task',
    states: [{ name: 'To Do', category: 'Proposed' }],
    fields: [],
  },
];
const targetFields: WitField[] = [
  { name: 'Title', referenceName: 'System.Title', type: 'string' },
  { name: 'Description', referenceName: 'System.Description', type: 'html' },
  { name: 'Priority', referenceName: 'Microsoft.VSTS.Common.Priority', type: 'integer' },
  { name: 'Story Points', referenceName: 'Microsoft.VSTS.Scheduling.StoryPoints', type: 'double' },
  { name: 'Assigned To', referenceName: 'System.AssignedTo', type: 'string', isIdentity: true },
  { name: 'Rev', referenceName: 'System.Rev', type: 'integer', readOnly: true },
];

describe('auto mapping', () => {
  it('maps Jira types to their usual Azure DevOps types', () => {
    const m = autoTypes(
      [
        { name: 'Story', states: [] },
        { name: 'Sub-task', states: [] },
        { name: 'Bug', states: [] },
        { name: 'Spike', states: [] },
      ],
      targetTypes,
    );
    expect(m).toEqual({ Story: 'User Story', 'Sub-task': 'Task', Bug: 'Bug', Spike: UNMAPPED });
  });

  it('maps states by name, then by category', () => {
    expect(
      autoStates(
        [
          { name: 'Active' },
          { name: 'In Review', category: 'InProgress' },
          { name: 'Done', category: 'Completed' },
        ],
        targetTypes[0],
      ),
    ).toEqual({ Active: 'Active', 'In Review': 'Active', Done: 'Closed' });
  });

  it('maps fields by reference or name and type, else appends', () => {
    expect(
      autoFields(
        [
          { key: 'Microsoft.VSTS.Common.Priority', name: 'Priority', type: 'integer' },
          { key: 'customfield_1', name: 'Story Points', type: 'double' },
          { key: 'System.Rev', name: 'Rev', type: 'integer' },
          { key: 'Custom.Team', name: 'Team', type: 'string' },
        ],
        targetFields,
      ),
    ).toEqual({
      'Microsoft.VSTS.Common.Priority': 'Microsoft.VSTS.Common.Priority',
      customfield_1: 'Microsoft.VSTS.Scheduling.StoryPoints',
      'System.Rev': APPEND,
      'Custom.Team': APPEND,
    });
  });

  it('maps priorities and people', () => {
    expect(autoPriorities(['Highest', 'High', 'Medium', 'Low'])).toEqual({
      Highest: '1',
      High: '2',
      Medium: '3',
      Low: '4',
    });
    expect(
      autoUsers(
        [
          { displayName: 'Ana', uniqueName: 'ana@x.com' },
          { displayName: 'Bo' },
          { displayName: 'Cy' },
        ],
        [
          { displayName: 'Ana B', uniqueName: 'ANA@x.com' },
          { displayName: 'Bo', uniqueName: 'bo@x.com' },
        ],
      ),
    ).toEqual({ 'ana@x.com': 'ANA@x.com', bo: 'bo@x.com', cy: UNMAPPED });
  });

  it('coerces values for the target type', () => {
    expect(coerce('3.6', 'integer')).toBe(4);
    expect(coerce('abc', 'double')).toBeUndefined();
    expect(coerce('2024-01-02', 'dateTime')).toBe('2024-01-02T00:00:00.000Z');
    expect(coerce({ name: 'High' }, 'string')).toBe('High');
  });
});

const baseMapping = (): BoardsMapping => ({
  types: { Story: 'User Story' },
  states: { Story: { 'In Progress': 'Active', Done: 'Closed' } },
  fields: {
    priority: 'Microsoft.VSTS.Common.Priority',
    team: APPEND,
    description: 'System.Description',
    assignee: 'System.AssignedTo',
  },
  values: { priority: { High: '2' } },
  areaPrefix: '',
  iterationPrefix: 'Jira',
  users: { enabled: false, map: {} },
  tag: 'migrated',
  hyperlinkBack: true,
  sourceIdField: '',
  keepCreated: true,
  titlePrefix: true,
});

const item = (): NormalizedItem => ({
  sourceKey: 'ABC-1',
  sourceUrl: 'https://acme.atlassian.net/browse/ABC-1',
  type: 'Story',
  title: 'Login fails',
  state: 'Done',
  fields: { priority: { name: 'High' }, team: 'Blue' },
  html: { description: '<p>Steps</p>' },
  iterationPath: ['Sprint 3'],
  createdAt: '2024-03-01T10:00:00.000Z',
  createdBy: 'ana@x.com',
  people: { assignee: { displayName: 'Ana', uniqueName: 'ana@x.com' } },
  tags: ['backend'],
  attachments: [],
  links: [],
  hyperlinks: [],
  unsupportedLinks: 0,
});

const pctx = (over: Partial<PatchContext> = {}): PatchContext => ({
  targetProject: 'P2',
  targetType: targetTypes[0]!,
  targetFields: new Map(targetFields.map((f) => [f.referenceName, f])),
  sourceFields: new Map([
    ['priority', { key: 'priority', name: 'Priority', type: 'string' }],
    ['team', { key: 'team', name: 'Team', type: 'string' }],
    ['assignee', { key: 'assignee', name: 'Assignee', type: 'identity' }],
  ]),
  mapping: baseMapping(),
  bypassRules: true,
  html: { description: '<p>Steps</p>' },
  ...over,
});

const value = (patch: { path: string; value?: unknown }[], path: string) =>
  patch.find((p) => p.path === path)?.value;

describe('create patch', () => {
  it('sets mapped fields, paths, tags, state and original dates (with bypass)', () => {
    const plan = buildCreatePatch(item(), pctx());
    const p = plan.patch;
    expect(value(p, '/fields/System.Title')).toBe('[ABC-1] Login fails');
    expect(value(p, '/fields/System.State')).toBe('Closed');
    expect(plan.stateAfter).toBeUndefined();
    expect(value(p, '/fields/System.IterationPath')).toBe('P2\\Jira\\Sprint 3');
    expect(value(p, '/fields/System.AreaPath')).toBe('P2');
    expect(value(p, '/fields/System.Tags')).toBe('backend; migrated');
    expect(value(p, '/fields/Microsoft.VSTS.Common.Priority')).toBe(2);
    expect(value(p, '/fields/System.CreatedDate')).toBe('2024-03-01T10:00:00.000Z');
    expect(value(p, '/fields/System.AssignedTo')).toBeUndefined(); // user mapping off
    const desc = String(value(p, '/fields/System.Description'));
    expect(desc).toContain('<p>Steps</p>');
    expect(desc).toContain('Team');
    expect(desc).toContain('Blue');
    expect(desc).toContain('Original assignee');
    expect(p.some((x) => x.path === '/relations/-')).toBe(true);
  });

  it('without bypass: no state or dates on create, state set afterwards', () => {
    const plan = buildCreatePatch(item(), pctx({ bypassRules: false }));
    expect(value(plan.patch, '/fields/System.State')).toBeUndefined();
    expect(value(plan.patch, '/fields/System.CreatedDate')).toBeUndefined();
    expect(plan.stateAfter).toBe('Closed');
  });

  it('assigns people only when user mapping is on and they match', () => {
    const m = baseMapping();
    m.users = { enabled: true, map: { 'ana@x.com': 'ana@target.com' } };
    const plan = buildCreatePatch(item(), pctx({ mapping: m }));
    expect(value(plan.patch, '/fields/System.AssignedTo')).toBe('ana@target.com');
  });

  it('a retry keeps only the core fields', () => {
    const plan = buildCreatePatch(item(), pctx());
    const paths = minimalPatch(plan).map((p) => p.path);
    expect(paths).toContain('/fields/System.Title');
    expect(paths).toContain('/fields/System.Description');
    expect(paths).not.toContain('/fields/Microsoft.VSTS.Common.Priority');
  });

  it('types without a description put the text in Repro Steps', () => {
    const plan = buildCreatePatch(
      { ...item(), type: 'Story' },
      pctx({ targetType: targetTypes[1]! }),
    );
    expect(String(value(plan.patch, '/fields/Microsoft.VSTS.TCM.ReproSteps'))).toContain(
      '<p>Steps</p>',
    );
    expect(value(plan.patch, '/fields/System.Description')).toBeUndefined();
  });
});

describe('readers', () => {
  it('normalizes an Azure DevOps work item', () => {
    const defs = new Map<string, WitField>([
      [
        'System.Description',
        { name: 'Description', referenceName: 'System.Description', type: 'html' },
      ],
      [
        'System.AssignedTo',
        {
          name: 'Assigned To',
          referenceName: 'System.AssignedTo',
          type: 'string',
          isIdentity: true,
        },
      ],
      [
        'Microsoft.VSTS.Common.Priority',
        { name: 'Priority', referenceName: 'Microsoft.VSTS.Common.Priority', type: 'integer' },
      ],
    ]);
    const n = normalizeAdoItem(
      {
        id: 5,
        fields: {
          'System.WorkItemType': 'Bug',
          'System.Title': 'Crash',
          'System.State': 'Active',
          'System.AreaPath': 'P1\\Team A',
          'System.IterationPath': 'P1',
          'System.Tags': 'ui; urgent',
          'System.Description': '<p>x</p><script>bad()</script>',
          'System.AssignedTo': { displayName: 'Ana', uniqueName: 'ana@x.com' },
          'Microsoft.VSTS.Common.Priority': 1,
          'System.Rev': 4,
        },
        relations: [
          {
            rel: 'System.LinkTypes.Hierarchy-Reverse',
            url: 'https://dev.azure.com/a/_apis/wit/workItems/2',
          },
          {
            rel: 'System.LinkTypes.Hierarchy-Forward',
            url: 'https://dev.azure.com/a/_apis/wit/workItems/9',
          },
          { rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/a/_apis/wit/workItems/3' },
          { rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/a/_apis/wit/workItems/8' },
          {
            rel: 'AttachedFile',
            url: 'https://dev.azure.com/a/_apis/wit/attachments/g',
            attributes: { name: 'log.txt' },
          },
          { rel: 'ArtifactLink', url: 'vstfs:///Git/Commit/x' },
        ],
      },
      defs,
      () => 'InProgress',
      'a',
      'P1',
    );
    expect(n).toMatchObject({
      sourceKey: '5',
      type: 'Bug',
      state: 'Active',
      stateCategory: 'InProgress',
      areaPath: ['Team A'],
      iterationPath: [],
      tags: ['ui', 'urgent'],
      unsupportedLinks: 1,
    });
    expect(n.html['System.Description']).toBe('<p>x</p>');
    expect(n.people['System.AssignedTo']).toEqual({ displayName: 'Ana', uniqueName: 'ana@x.com' });
    expect(n.fields).toEqual({ 'Microsoft.VSTS.Common.Priority': 1 });
    expect(n.links).toEqual([
      { rel: 'System.LinkTypes.Hierarchy-Reverse', targetKey: '2' },
      { rel: 'System.LinkTypes.Related', targetKey: '8' },
    ]);
    expect(n.attachments).toEqual([
      { name: 'log.txt', url: 'https://dev.azure.com/a/_apis/wit/attachments/g', size: undefined },
    ]);
  });

  it('normalizes a Jira issue', () => {
    const defs = new Map<string, JiraField>([
      [
        'customfield_10020',
        {
          id: 'customfield_10020',
          name: 'Sprint',
          custom: true,
          schema: { type: 'array', custom: 'com.pyxis.greenhopper.jira:gh-sprint' },
        },
      ],
      [
        'customfield_10016',
        {
          id: 'customfield_10016',
          name: 'Story point estimate',
          custom: true,
          schema: { type: 'number' },
        },
      ],
    ]);
    const n = normalizeJiraIssue(
      {
        id: '1',
        key: 'ABC-2',
        fields: {
          summary: 'Add SSO',
          issuetype: { name: 'Story' },
          status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
          labels: ['auth'],
          components: [{ name: 'Web' }],
          assignee: { displayName: 'Bo' },
          priority: { name: 'High' },
          parent: { key: 'ABC-1' },
          customfield_10020: [{ name: 'Sprint 1' }, { name: 'Sprint 2' }],
          customfield_10016: 5,
          issuelinks: [
            { type: { name: 'Blocks' }, outwardIssue: { key: 'ABC-9' } },
            { type: { name: 'Blocks' }, inwardIssue: { key: 'ABC-8' } },
            { type: { name: 'Relates' }, outwardIssue: { key: 'ABC-1' } },
          ],
          attachment: [
            {
              filename: 'a.png',
              content: 'https://acme.atlassian.net/rest/api/3/attachment/content/10',
              size: 3,
            },
          ],
        },
        renderedFields: { description: '<p>See <img src="/secure/attachment/10/a.png"></p>' },
      },
      defs,
      'acme',
    );
    expect(n).toMatchObject({
      sourceKey: 'ABC-2',
      type: 'Story',
      state: 'In Progress',
      stateCategory: 'InProgress',
      iterationPath: ['Sprint 2'],
      tags: ['auth', 'Web'],
    });
    expect(n.people.assignee).toEqual({ displayName: 'Bo', uniqueName: undefined });
    expect(n.fields).toEqual({ priority: { name: 'High' }, customfield_10016: 5 });
    expect(n.html.description).toContain(
      'src="https://acme.atlassian.net/rest/api/3/attachment/content/10"',
    );
    expect(n.links).toEqual([
      { rel: 'System.LinkTypes.Hierarchy-Reverse', targetKey: 'ABC-1' },
      { rel: 'System.LinkTypes.Dependency-Forward', targetKey: 'ABC-9' },
    ]);
  });

  it('makes Jira links absolute', () => {
    expect(absolutizeJiraHtml('<a href="/browse/ABC-1">x</a>', 'acme')).toBe(
      '<a href="https://acme.atlassian.net/browse/ABC-1">x</a>',
    );
  });
});

describe('writer helpers', () => {
  it('lists every path the items use, parents first, with iteration dates', () => {
    const items = [
      { ...item(), iterationPath: ['R1', 'Sprint 1'] },
      { ...item(), iterationPath: ['R1'] },
    ];
    const paths = neededPaths(items, (i) => i.iterationPath, [
      {
        name: 'R1',
        children: [
          { name: 'Sprint 1', startDate: '2024-01-01', finishDate: '2024-01-14', children: [] },
        ],
      },
    ]);
    expect(paths.map((p) => p.segments.join('\\'))).toEqual(['R1', 'R1\\Sprint 1']);
    expect(paths[1]).toMatchObject({ startDate: '2024-01-01', finishDate: '2024-01-14' });
  });
});

describe('state fallback', () => {
  it('uses the nearest category when the target lacks one', () => {
    const scrumBug: WitType = {
      name: 'Bug',
      referenceName: 'B',
      states: [
        { name: 'New', category: 'Proposed' },
        { name: 'Committed', category: 'InProgress' },
        { name: 'Done', category: 'Completed' },
      ],
    };
    expect(
      autoStates(
        [
          { name: 'Resolved', category: 'Resolved' },
          { name: 'Removed', category: 'Removed' },
        ],
        scrumBug,
      ),
    ).toEqual({
      Resolved: 'Done',
      Removed: 'Done',
    });
  });
});
