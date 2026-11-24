import { describe, expect, it } from 'vitest';
import {
  buildMissingKeysUpdate,
  invalidGroupName,
  isKeyVaultGroup,
  nameTaken,
  planGroupCopy,
  planMissingKeys,
} from '@/lib/utils/groupCopy';
import type { VariableMap } from '@/types/ado';

const secret = { value: undefined, isSecret: true };
const source: { variables: VariableMap } = {
  variables: {
    A: { value: '1' },
    b: { value: '2' },
    NewKey: { value: 'n' },
    EmptyKey: { value: '' },
    NewSecret: secret,
  },
};
const target: { variables: VariableMap } = {
  variables: { a: { value: 'different' }, B: { value: '2' }, Existing: secret },
};

describe('planMissingKeys', () => {
  it('compares keys case-insensitively and separates secrets', () => {
    const plan = planMissingKeys(source, target);
    expect(plan.copyable).toEqual([
      { key: 'EmptyKey', value: '' },
      { key: 'NewKey', value: 'n' },
    ]);
    expect(plan.secrets).toEqual(['NewSecret']);
    expect(plan.sharedCount).toBe(2);
  });
});

describe('buildMissingKeysUpdate', () => {
  const plan = planMissingKeys(source, target);

  it('keeps every existing target variable untouched, including secrets', () => {
    const next = buildMissingKeysUpdate(target, plan, new Set(['NewKey']), false);
    expect(next.a).toEqual({ value: 'different' });
    expect(next.Existing).toEqual(secret);
    expect(next.NewKey).toEqual({ value: 'n', isSecret: false });
    expect(next.EmptyKey).toBeUndefined();
    expect(next.NewSecret).toBeUndefined();
  });

  it('adds selected secrets only as empty placeholders, and only when asked', () => {
    const all = new Set(['NewKey', 'EmptyKey', 'NewSecret']);
    expect(buildMissingKeysUpdate(target, plan, all, false).NewSecret).toBeUndefined();
    expect(buildMissingKeysUpdate(target, plan, all, true).NewSecret).toEqual({
      value: '',
      isSecret: true,
    });
  });

  it('never overwrites a shared key even if selected', () => {
    const next = buildMissingKeysUpdate(target, plan, new Set(['A', 'a']), true);
    expect(next.a).toEqual({ value: 'different' });
    expect(next.A).toBeUndefined();
  });

  it('does not mutate the target', () => {
    const before = JSON.stringify(target);
    buildMissingKeysUpdate(target, plan, new Set(['NewKey']), true);
    expect(JSON.stringify(target)).toBe(before);
  });
});

describe('planGroupCopy', () => {
  it('copies values (including empty ones) and makes secrets empty placeholders', () => {
    const p = planGroupCopy(source, 'placeholder');
    expect(p.copiedCount).toBe(4);
    expect(p.secrets).toEqual(['NewSecret']);
    expect(p.variables.NewSecret).toEqual({ value: '', isSecret: true });
    expect(p.variables.EmptyKey).toEqual({ value: '', isSecret: false });
  });
  it('leaves secrets out when skipping', () => {
    const p = planGroupCopy(source, 'skip');
    expect(p.variables.NewSecret).toBeUndefined();
    expect(Object.keys(p.variables)).toHaveLength(4);
  });
});

describe('names and group types', () => {
  it('detects name clashes case-insensitively, ignoring outer spaces', () => {
    expect(nameTaken('  App-Prod ', [{ name: 'app-prod' }])).toBe(true);
    expect(nameTaken('app-prod-copy', [{ name: 'app-prod' }])).toBe(false);
  });
  it('requires a non-blank name', () => {
    expect(invalidGroupName('  ')).not.toBeNull();
    expect(invalidGroupName('x')).toBeNull();
  });
  it('recognizes Key Vault-linked groups', () => {
    expect(isKeyVaultGroup({ type: 'AzureKeyVault' })).toBe(true);
    expect(isKeyVaultGroup({ type: 'Vsts' })).toBe(false);
  });
});
