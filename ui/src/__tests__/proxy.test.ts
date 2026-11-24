import { describe, expect, it } from 'vitest';
import { isMethodAllowed, jiraTarget } from '../../middleware';

describe('proxy method allow-list', () => {
  it('allows reads and updates under the proxy', () => {
    expect(isMethodAllowed('GET', '/ado/contoso/_apis/projects')).toBe(true);
    expect(isMethodAllowed('PUT', '/ado/contoso/_apis/distributedtask/variablegroups/12')).toBe(
      true,
    );
  });

  it('allows POST for creating a variable group, nowhere near it', () => {
    expect(isMethodAllowed('POST', '/ado/contoso/_apis/distributedtask/variablegroups')).toBe(true);
    expect(isMethodAllowed('POST', '/ado/contoso/_apis/distributedtask/variablegroups/')).toBe(
      true,
    );
    expect(isMethodAllowed('POST', '/ado/contoso/_apis/distributedtask/variablegroups/12')).toBe(
      false,
    );
    expect(isMethodAllowed('POST', '/ado/contoso/proj/_apis/distributedtask/variablegroups')).toBe(
      false,
    );
    expect(isMethodAllowed('POST', '/vsrm/contoso/_apis/distributedtask/variablegroups')).toBe(
      false,
    );
  });

  it('allows each migration write on its exact endpoint', () => {
    const ok: [string, string][] = [
      ['POST', '/ado/contoso/Proj/_apis/git/repositories'],
      ['POST', '/ado/contoso/Proj/_apis/git/repositories/3f2a/importRequests'],
      ['POST', '/ado/contoso/_apis/serviceendpoint/endpoints'],
      [
        'DELETE',
        '/ado/contoso/_apis/serviceendpoint/endpoints/1b4e28ba-2fa1-11d2-883f-0016d3cca427',
      ],
      ['POST', '/ado/contoso/Proj/_apis/policy/configurations'],
      ['POST', '/ado/contoso/Proj/_apis/build/definitions'],
      ['POST', '/vsrm/contoso/Proj/_apis/release/definitions'],
      ['POST', '/ado/contoso/Proj/_apis/distributedtask/taskgroups'],
      ['POST', '/ado/contoso/Proj/_apis/distributedtask/environments'],
      ['POST', '/ado/contoso/Proj/_apis/wit/wiql'],
      ['POST', '/ado/contoso/_apis/wit/workitemsbatch'],
      ['POST', '/ado/contoso/Proj/_apis/wit/workitems/%24User%20Story'],
      ['POST', '/ado/contoso/Proj/_apis/wit/workitems/$Bug'],
      ['PATCH', '/ado/contoso/_apis/wit/workitems/42'],
      ['POST', '/ado/contoso/Proj/_apis/wit/attachments'],
      ['POST', '/ado/contoso/Proj/_apis/wit/workItems/42/comments'],
      ['POST', '/ado/contoso/Proj/_apis/wit/classificationnodes/Areas'],
      ['POST', '/ado/contoso/Proj/_apis/wit/classificationnodes/Iterations/Release%201'],
      ['POST', '/ado/contoso/_apis/work/processes/abc/workitemtypes'],
      ['POST', '/ado/contoso/_apis/work/processes/abc/workItemTypes/Proc.Bug/states'],
      ['POST', '/ado/contoso/_apis/wit/fields'],
    ];
    for (const [method, path] of ok)
      expect(isMethodAllowed(method, path), `${method} ${path}`).toBe(true);
  });

  it('refuses writes anywhere else', () => {
    const no: [string, string][] = [
      ['DELETE', '/ado/contoso/_apis/distributedtask/variablegroups/12'],
      ['PATCH', '/ado/contoso/_apis/distributedtask/variablegroups/12'],
      ['DELETE', '/ado/contoso/_apis/serviceendpoint/endpoints/not-a-guid'],
      ['DELETE', '/ado/contoso/Proj/_apis/git/repositories/3f2a'],
      ['POST', '/ado/contoso/_apis/git/repositories'],
      ['POST', '/ado/contoso/Proj/_apis/git/repositories/3f2a/pushes'],
      ['PATCH', '/ado/contoso/_apis/wit/workitems/abc'],
      ['POST', '/ado/contoso/Proj/_apis/wit/workitems/42'],
      ['POST', '/ado/contoso/_apis/securitynamespaces'],
      ['POST', '/ado/contoso/Proj/_apis/wit/classificationnodes/Teams'],
      ['POST', '/ado/contoso/_apis/graph/users'],
      ['PUT', '/jira/acme/rest/api/3/issue/ABC-1'],
    ];
    for (const [method, path] of no)
      expect(isMethodAllowed(method, path), `${method} ${path}`).toBe(false);
  });
});

describe('Jira proxy', () => {
  it('pins the host to {site}.atlassian.net', () => {
    expect(jiraTarget('GET', '/jira/acme/rest/api/3/myself')).toBe(
      'https://acme.atlassian.net/rest/api/3/myself',
    );
    expect(jiraTarget('POST', '/jira/acme/rest/api/3/search/jql')).toBe(
      'https://acme.atlassian.net/rest/api/3/search/jql',
    );
  });

  it('is read-only apart from the issue search', () => {
    expect(jiraTarget('POST', '/jira/acme/rest/api/3/issue')).toBeNull();
    expect(jiraTarget('PUT', '/jira/acme/rest/api/3/issue/ABC-1')).toBeNull();
    expect(jiraTarget('DELETE', '/jira/acme/rest/api/3/issue/ABC-1')).toBeNull();
  });

  it('refuses site names that could point anywhere else', () => {
    for (const path of [
      '/jira/evil.com/rest/api/3/myself',
      '/jira/a.b/rest/api/3/myself',
      '/jira//rest/api/3/myself',
      '/jira/evil.com#/rest/api/3/myself',
      '/jira/acme@evil.com/rest/api/3/myself',
      '/jira/ACME/rest/api/3/myself',
      '/jira/acme/secure/attachment/1/x.png',
      '/jira/acme/rest/../../evil',
      '/jira/acme/rest/api/3/%2e%2e/x',
      '/jira/-acme/rest/api/3/myself',
    ]) {
      expect(jiraTarget('GET', path), path).toBeNull();
      expect(isMethodAllowed('GET', path), path).toBe(false);
    }
  });
});
