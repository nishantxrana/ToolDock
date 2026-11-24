import type { ComboboxOption } from '@/components/ui/combobox';
import { UNMAPPED, type MapRow } from './MapTable';

/** Match each source name to a target option by name (case-insensitive). */
export function autoMatch(
  rows: MapRow[],
  options: ComboboxOption[],
  fallback = UNMAPPED,
): Record<string, string> {
  const byName = new Map(options.map((o) => [o.label.trim().toLowerCase(), o.value]));
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = byName.get(r.label.trim().toLowerCase()) ?? fallback;
  return out;
}
