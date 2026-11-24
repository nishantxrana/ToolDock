import type { VariableGroup } from '@/types/ado';

export type SearchScope = 'both' | 'keys' | 'values';

export interface SearchOptions {
  scope: SearchScope;
  /** Match the whole key/value instead of any part of it. */
  exact: boolean;
  caseSensitive: boolean;
}

export interface SearchMatch {
  groupId: number;
  groupName: string;
  key: string;
  /** null when the variable is secret (its value can't be read). */
  value: string | null;
  isSecret: boolean;
  matchedKey: boolean;
  matchedValue: boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  scope: 'both',
  exact: false,
  caseSensitive: false,
};

function matcher(query: string, { exact, caseSensitive }: SearchOptions) {
  const q = caseSensitive ? query : query.toLowerCase();
  return (text: string) => {
    const t = caseSensitive ? text : text.toLowerCase();
    return exact ? t === q : t.includes(q);
  };
}

/**
 * Find variables across groups whose key and/or value match the query.
 * Secret values are never matched (Azure DevOps doesn't return them), but a
 * secret's key still matches. Results are ordered by group name, then key.
 */
export function searchVariableGroups(
  groups: readonly VariableGroup[],
  rawQuery: string,
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
): SearchMatch[] {
  const query = rawQuery.trim();
  if (!query) return [];
  const test = matcher(query, options);
  const lookAtKeys = options.scope !== 'values';
  const lookAtValues = options.scope !== 'keys';

  const out: SearchMatch[] = [];
  const sorted = [...groups].sort((a, b) => a.name.localeCompare(b.name));
  for (const g of sorted) {
    const keys = Object.keys(g.variables ?? {}).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    for (const key of keys) {
      const v = g.variables[key];
      const isSecret = Boolean(v?.isSecret);
      const value = isSecret ? null : (v?.value ?? '');
      const matchedKey = lookAtKeys && test(key);
      const matchedValue = lookAtValues && value !== null && test(value);
      if (matchedKey || matchedValue) {
        out.push({
          groupId: g.id,
          groupName: g.name,
          key,
          value,
          isSecret,
          matchedKey,
          matchedValue,
        });
      }
    }
  }
  return out;
}

/** Split text into [before, match, after] segments for highlighting the first hit. */
export function highlightParts(
  text: string,
  rawQuery: string,
  caseSensitive: boolean,
): { text: string; hit: boolean }[] {
  const query = rawQuery.trim();
  if (!query) return [{ text, hit: false }];
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const parts: { text: string; hit: boolean }[] = [];
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i === -1) break;
    if (i > from) parts.push({ text: text.slice(from, i), hit: false });
    parts.push({ text: text.slice(i, i + needle.length), hit: true });
    from = i + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}
