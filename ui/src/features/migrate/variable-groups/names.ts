import { nameTaken } from '@/lib/utils/groupCopy';

/** First free "<name>-migrated", "<name>-migrated-2"… */
export function freeName(name: string, existing: { name: string }[]): string {
  let candidate = `${name}-migrated`;
  for (let i = 2; nameTaken(candidate, existing); i++) candidate = `${name}-migrated-${i}`;
  return candidate;
}
