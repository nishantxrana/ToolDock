import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils/cn';

export const UNMAPPED = '__none__';

export interface MapRow {
  key: string;
  label: string;
  detail?: ReactNode;
}

/**
 * Source item → target item, one row each. The target list always offers a
 * "no match" option, described by `unmappedLabel`, so a choice is explicit.
 */
export function MapTable({
  title,
  description,
  rows,
  options,
  value,
  onChange,
  unmappedLabel = 'No match (leave out)',
  sourceHeading = 'In the source',
  targetHeading = 'In the target',
  extraOptions = [],
}: {
  title: string;
  description?: ReactNode;
  rows: MapRow[];
  options: ComboboxOption[];
  value: Record<string, string>;
  onChange: (key: string, target: string) => void;
  unmappedLabel?: string;
  sourceHeading?: string;
  targetHeading?: string;
  /** Extra choices shown before the target items (e.g. "Create it"). */
  extraOptions?: ComboboxOption[];
}) {
  if (rows.length === 0) return null;
  const all: ComboboxOption[] = [
    ...extraOptions,
    { value: UNMAPPED, label: unmappedLabel },
    ...options,
  ];
  const unmapped = rows.filter((r) => (value[r.key] ?? UNMAPPED) === UNMAPPED).length;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-13 font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <span
          className={cn('text-xs tabular-nums', unmapped > 0 ? 'text-warning' : 'text-success')}
        >
          {unmapped > 0 ? `${unmapped} without a match` : 'All matched'}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[45%]">{sourceHeading}</TableHead>
              <TableHead className="w-6" />
              <TableHead>{targetHeading}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const v = value[r.key] ?? UNMAPPED;
              return (
                <TableRow key={r.key}>
                  <TableCell>
                    <p className="font-medium">{r.label}</p>
                    {r.detail && <p className="text-xs text-muted-foreground">{r.detail}</p>}
                  </TableCell>
                  <TableCell>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </TableCell>
                  <TableCell>
                    <Combobox
                      options={all}
                      value={v}
                      onChange={(t) => onChange(r.key, t)}
                      className={cn('h-8', v === UNMAPPED && 'border-warning-border')}
                      searchPlaceholder="Find in target"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
