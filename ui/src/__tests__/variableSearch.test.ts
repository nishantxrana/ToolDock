import { describe, expect, it } from 'vitest';
import { highlightParts, searchVariableGroups } from '@/lib/utils/variableSearch';
import type { VariableGroup } from '@/types/ado';

const g = (id: number, name: string, variables: VariableGroup['variables']): VariableGroup => ({
  id,
  name,
  type: 'Vsts',
  variables,
});

const groups = [
  g(2, 'payments-prod', {
    Redis__Host: { value: 'redis-prod.internal' },
    Db__Server: { value: 'sql-prod-01' },
    Jwt__Key: { value: undefined, isSecret: true },
  }),
  g(1, 'payments-dev', {
    Redis__Host: { value: 'redis-dev.internal' },
    REDIS__PORT: { value: '6379' },
    Empty: { value: '' },
  }),
];

describe('searchVariableGroups', () => {
  it('returns nothing for a blank query', () => {
    expect(searchVariableGroups(groups, '   ')).toEqual([]);
  });

  it('matches keys and values case-insensitively, ordered by group then key', () => {
    const r = searchVariableGroups(groups, 'redis');
    expect(r.map((m) => `${m.groupName}/${m.key}`)).toEqual([
      'payments-dev/Redis__Host',
      'payments-dev/REDIS__PORT',
      'payments-prod/Redis__Host',
    ]);
  });

  it('limits to values when asked', () => {
    const r = searchVariableGroups(groups, 'sql-prod', {
      scope: 'values',
      exact: false,
      caseSensitive: false,
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ key: 'Db__Server', matchedValue: true, matchedKey: false });
  });

  it('never matches a secret value, but does match a secret key', () => {
    const r = searchVariableGroups(groups, 'jwt');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      isSecret: true,
      value: null,
      matchedKey: true,
      matchedValue: false,
    });
    expect(
      searchVariableGroups(groups, 'jwt', { scope: 'values', exact: false, caseSensitive: false }),
    ).toEqual([]);
  });

  it('respects whole-match and case options', () => {
    const keys = (q: string, exact: boolean, caseSensitive: boolean) =>
      searchVariableGroups(groups, q, { scope: 'keys', exact, caseSensitive }).length;
    expect(keys('redis__host', true, false)).toBe(2);
    expect(keys('redis__host', true, true)).toBe(0);
    expect(keys('Redis', false, true)).toBe(2);
    expect(keys('redis__h', true, false)).toBe(0);
  });

  it('handles groups with no variables', () => {
    expect(searchVariableGroups([g(9, 'empty', {})], 'x')).toEqual([]);
  });
});

describe('highlightParts', () => {
  it('marks every occurrence, case-insensitively', () => {
    expect(highlightParts('Redis-redis', 'REDIS', false)).toEqual([
      { text: 'Redis', hit: true },
      { text: '-', hit: false },
      { text: 'redis', hit: true },
    ]);
  });
  it('returns the plain text when nothing matches', () => {
    expect(highlightParts('abc', 'z', false)).toEqual([{ text: 'abc', hit: false }]);
  });
});
