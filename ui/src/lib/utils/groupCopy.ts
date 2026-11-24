import type { VariableGroup, VariableMap } from '@/types/ado';

/** Groups linked to Azure Key Vault get their variables from the vault; they can't take plain variables. */
export function isKeyVaultGroup(group: Pick<VariableGroup, 'type'>): boolean {
  return group.type === 'AzureKeyVault';
}

const sortKeys = (keys: string[]) =>
  [...keys].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

// ---------------------------------------------------------------------------
// Copy missing keys (source -> target, same project)
// ---------------------------------------------------------------------------

export interface MissingKeysPlan {
  /** Keys in source, not in target, whose values can be copied. */
  copyable: { key: string; value: string }[];
  /** Keys in source, not in target, that are secret in source: value can't be read. */
  secrets: string[];
  /** Keys present in both (untouched by this tool). */
  sharedCount: number;
}

/** Key comparison is case-insensitive, matching how Azure DevOps treats variable names. */
export function planMissingKeys(
  source: Pick<VariableGroup, 'variables'>,
  target: Pick<VariableGroup, 'variables'>,
): MissingKeysPlan {
  const targetKeys = new Set(Object.keys(target.variables ?? {}).map((k) => k.toLowerCase()));
  const copyable: MissingKeysPlan['copyable'] = [];
  const secrets: string[] = [];
  let sharedCount = 0;
  for (const key of sortKeys(Object.keys(source.variables ?? {}))) {
    if (targetKeys.has(key.toLowerCase())) {
      sharedCount++;
      continue;
    }
    const v = source.variables[key];
    if (v?.isSecret) secrets.push(key);
    else copyable.push({ key, value: v?.value ?? '' });
  }
  return { copyable, secrets, sharedCount };
}

/**
 * The full variables map to PUT on the target: every existing target variable
 * exactly as returned (secrets keep value null, which tells Azure DevOps to
 * keep the stored secret), plus the chosen new keys. Secret keys, when
 * included, are added as empty secrets for someone to fill in.
 */
export function buildMissingKeysUpdate(
  target: Pick<VariableGroup, 'variables'>,
  plan: MissingKeysPlan,
  selected: ReadonlySet<string>,
  includeSecretPlaceholders: boolean,
): VariableMap {
  const next: VariableMap = {};
  for (const [k, v] of Object.entries(target.variables ?? {})) next[k] = { ...v };
  for (const { key, value } of plan.copyable) {
    if (selected.has(key)) next[key] = { value, isSecret: false };
  }
  if (includeSecretPlaceholders) {
    for (const key of plan.secrets) {
      if (selected.has(key)) next[key] = { value: '', isSecret: true };
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Copy a whole group (to another project, or the same one under a new name)
// ---------------------------------------------------------------------------

export type SecretMode = 'placeholder' | 'skip';

export interface GroupCopyPlan {
  variables: VariableMap;
  copiedCount: number;
  /** Secret keys in the source. With "placeholder" they are created empty; with "skip" left out. */
  secrets: string[];
}

export function planGroupCopy(
  source: Pick<VariableGroup, 'variables'>,
  mode: SecretMode,
): GroupCopyPlan {
  const variables: VariableMap = {};
  const secrets: string[] = [];
  let copiedCount = 0;
  for (const key of sortKeys(Object.keys(source.variables ?? {}))) {
    const v = source.variables[key];
    if (v?.isSecret) {
      secrets.push(key);
      if (mode === 'placeholder') variables[key] = { value: '', isSecret: true };
      continue;
    }
    variables[key] = { value: v?.value ?? '', isSecret: false };
    copiedCount++;
  }
  return { variables, copiedCount, secrets };
}

/** Variable group names are unique per project, compared case-insensitively. */
export function nameTaken(name: string, existing: readonly Pick<VariableGroup, 'name'>[]): boolean {
  const n = name.trim().toLowerCase();
  return existing.some((g) => g.name.trim().toLowerCase() === n);
}

/** Client-side checks only for what we know; Azure DevOps' own message covers the rest. */
export function invalidGroupName(name: string): string | null {
  return name.trim() ? null : 'Enter a name for the new group.';
}
