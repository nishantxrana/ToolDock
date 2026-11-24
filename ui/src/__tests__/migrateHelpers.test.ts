import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanRemoteUrl,
  formatSize,
  POLICY_TYPE,
  rewritePolicy,
  targetPlan,
} from '@/features/migrate/repos/repoPlan';
import { buildWiql } from '@/features/migrate/boards/wiql';
import { buildJql } from '@/features/migrate/jira/jql';
import { freeName } from '@/features/migrate/variable-groups/names';
import { customFieldRef } from '@/lib/migration/boards/process';
import { buildJiraAuthHeader } from '@/lib/api/auth';
import type { GitRepo } from '@/lib/api/migrate/git';

const repo = (name: string, extra: Partial<GitRepo> = {}): GitRepo => ({
  id: name,
  name,
  remoteUrl: `https://a@dev.azure.com/a/P/_git/${name}`,
  project: { id: 'p', name: 'P' },
  ...extra,
});

describe('repos', () => {
  it('strips the user name from clone URLs', () => {
    expect(cleanRemoteUrl('https://contoso@dev.azure.com/contoso/P/_git/web')).toBe(
      'https://dev.azure.com/contoso/P/_git/web',
    );
  });

  it('only imports into a new or empty repo', () => {
    const existing = [
      repo('web', { size: 2048, defaultBranch: 'refs/heads/main' }),
      repo('empty', { size: 0 }),
    ];
    expect(targetPlan('api', existing)).toBe('create');
    expect(targetPlan('EMPTY', existing)).toBe('import-into-empty');
    expect(targetPlan('Web', existing)).toBe('blocked');
    expect(targetPlan('bad/name', existing)).toBe('invalid');
    expect(targetPlan(' ', existing)).toBe('invalid');
  });

  it('formats sizes', () => {
    expect(formatSize(0)).toBe('Empty');
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('rewrites branch policies for the new repo, leaving out pipelines and people', () => {
    const base = { id: 1, isEnabled: true, isBlocking: true };
    const r = rewritePolicy(
      {
        ...base,
        type: { id: 'fa4e907d-c16b-4a4c-9dfa-4906e5d171dd' },
        settings: {
          minimumApproverCount: 2,
          scope: [
            { repositoryId: 'src', refName: 'refs/heads/main', matchKind: 'exact' },
            { repositoryId: 'other' },
          ],
        },
      },
      'src',
      'tgt',
    );
    expect(r).toEqual({
      body: {
        isEnabled: true,
        isBlocking: true,
        type: { id: 'fa4e907d-c16b-4a4c-9dfa-4906e5d171dd' },
        settings: {
          minimumApproverCount: 2,
          scope: [{ repositoryId: 'tgt', refName: 'refs/heads/main', matchKind: 'exact' }],
        },
      },
    });
    expect(
      rewritePolicy(
        {
          ...base,
          type: { id: POLICY_TYPE.buildValidation },
          settings: { scope: [{ repositoryId: 'src' }] },
        },
        'src',
        'tgt',
      ),
    ).toHaveProperty('skip');
    expect(
      rewritePolicy(
        {
          ...base,
          type: { id: POLICY_TYPE.requiredReviewers },
          settings: { scope: [{ repositoryId: 'src' }] },
        },
        'src',
        'tgt',
      ),
    ).toHaveProperty('skip');
  });
});

describe('queries', () => {
  it('builds WIQL with quoted values', () => {
    expect(
      buildWiql("O'Neil", {
        types: 'Bug, User Story',
        states: '',
        area: "O'Neil\\Team",
        changedSince: '2024-01-01',
        closed: false,
      }),
    ).toBe(
      "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = 'O''Neil' AND [System.WorkItemType] IN ('Bug', 'User Story') AND [System.State] NOT IN ('Closed', 'Done', 'Removed') AND [System.AreaPath] UNDER 'O''Neil\\Team' AND [System.ChangedDate] >= '2024-01-01' ORDER BY [System.Id]",
    );
  });

  it('builds JQL and keeps the ordering under control', () => {
    expect(buildJql('ABC', '')).toBe('project = "ABC" ORDER BY created ASC');
    expect(buildJql('ABC', 'status = Done ORDER BY key')).toBe(
      'project = "ABC" AND (status = Done) ORDER BY created ASC',
    );
  });
});

describe('names and auth', () => {
  it('finds a free "-migrated" name', () => {
    expect(freeName('App', [{ name: 'app' }])).toBe('App-migrated');
    expect(freeName('App', [{ name: 'App-migrated' }, { name: 'app-MIGRATED-2' }])).toBe(
      'App-migrated-3',
    );
  });

  it('builds custom field reference names Azure DevOps accepts', () => {
    expect(customFieldRef('Story point estimate')).toBe('Custom.StoryPointEstimate');
    expect(customFieldRef('***')).toBe('Custom.MigratedField');
  });

  it('builds the Jira Basic header (UTF-8 safe)', () => {
    expect(buildJiraAuthHeader('a@b.com', 'tok')).toBe(`Basic ${btoa('a@b.com:tok')}`);
    expect(() => buildJiraAuthHeader('zoë@b.com', 'tök')).not.toThrow();
  });
});

describe('proxy URLs for links inside work items', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('only ever maps Azure DevOps and Atlassian hosts', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://tooldock.test' } });
    const { toProxyUrl } = await import('@/lib/api/client');
    expect(toProxyUrl('https://dev.azure.com/a/_apis/wit/attachments/1?fileName=x.png')).toBe(
      'https://tooldock.test/ado/a/_apis/wit/attachments/1?fileName=x.png',
    );
    expect(toProxyUrl('https://contoso.visualstudio.com/_apis/wit/attachments/1')).toBe(
      'https://tooldock.test/ado/contoso/_apis/wit/attachments/1',
    );
    expect(toProxyUrl('https://acme.atlassian.net/rest/api/3/attachment/content/5')).toBe(
      'https://tooldock.test/jira/acme/rest/api/3/attachment/content/5',
    );
    for (const bad of [
      'https://evil.com/x',
      'http://dev.azure.com/a',
      'https://dev.azure.com.evil.com/a',
      'https://a.b.atlassian.net.evil/x',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(toProxyUrl(bad), bad).toBeNull();
    }
  });
});
