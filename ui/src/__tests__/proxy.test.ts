import { describe, expect, it } from 'vitest';
import { isMethodAllowed } from '../../middleware';

describe('proxy method allow-list', () => {
  it('allows reads and updates under the proxy', () => {
    expect(isMethodAllowed('GET', '/ado/contoso/_apis/projects')).toBe(true);
    expect(isMethodAllowed('PUT', '/ado/contoso/_apis/distributedtask/variablegroups/12')).toBe(
      true,
    );
  });

  it('allows POST only for creating a variable group', () => {
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
    expect(isMethodAllowed('POST', '/ado/contoso/_apis/git/repositories')).toBe(false);
    expect(isMethodAllowed('POST', '/vsrm/contoso/_apis/distributedtask/variablegroups')).toBe(
      false,
    );
  });

  it('blocks deletes and patches', () => {
    expect(isMethodAllowed('DELETE', '/ado/contoso/_apis/distributedtask/variablegroups/12')).toBe(
      false,
    );
    expect(isMethodAllowed('PATCH', '/ado/contoso/_apis/distributedtask/variablegroups/12')).toBe(
      false,
    );
  });
});
