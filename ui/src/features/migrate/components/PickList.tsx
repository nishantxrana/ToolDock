import { useMemo, useState, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SearchBox } from '@/components/common/SearchBox';
import { cn } from '@/lib/utils/cn';

export interface PickRow {
  id: string;
  label: string;
  /** Second line (counts, path…). */
  detail?: ReactNode;
  /** Right-aligned badges. */
  badges?: ReactNode;
  /** Shown greyed out with its checkbox disabled, and why. */
  disabledReason?: string;
  /** Extra text matched by the search box. */
  search?: string;
}

/**
 * Checkbox list with search and select-all. Disabled rows stay visible (with
 * the reason on hover) so it's clear what won't be migrated, and why.
 */
export function PickList({
  rows,
  selected,
  onChange,
  emptyText = 'Nothing to migrate here.',
  noun = 'item',
}: {
  rows: PickRow[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  emptyText?: string;
  noun?: string;
}) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.label} ${r.search ?? ''}`.toLowerCase().includes(q)) : rows;
  }, [rows, query]);
  const selectable = visible.filter((r) => !r.disabledReason);
  const selectedVisible = selectable.filter((r) => selected.has(r.id)).length;
  const all = selectable.length > 0 && selectedVisible === selectable.length;
  const some = selectedVisible > 0 && !all;
  const disabledCount = rows.filter((r) => r.disabledReason).length;

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-13 text-muted-foreground">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-13">
          <Checkbox
            checked={all ? true : some ? 'indeterminate' : false}
            disabled={selectable.length === 0}
            onCheckedChange={() => {
              const next = new Set(selected);
              for (const r of selectable) {
                if (all) next.delete(r.id);
                else next.add(r.id);
              }
              onChange(next);
            }}
            aria-label="Select all"
          />
          Select all
        </label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {selected.size} of {rows.length - disabledCount} {noun}
          {rows.length - disabledCount === 1 ? '' : 's'} selected
          {disabledCount > 0 && ` · ${disabledCount} can't be migrated`}
        </span>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder={`Find ${noun}s`}
          className="ml-auto w-64"
        />
      </div>
      <ul className="max-h-[28rem] divide-y divide-border-subtle overflow-y-auto rounded-lg border scrollbar-thin">
        {visible.map((r) => {
          const disabled = Boolean(r.disabledReason);
          const row = (
            <li
              key={r.id}
              className={cn(
                'flex items-center gap-3 px-3 py-2 text-13',
                disabled ? 'bg-muted/40 text-muted-foreground' : 'hover:bg-row-hover',
              )}
            >
              <Checkbox
                checked={selected.has(r.id)}
                disabled={disabled}
                onCheckedChange={(v) => {
                  const next = new Set(selected);
                  if (v) next.add(r.id);
                  else next.delete(r.id);
                  onChange(next);
                }}
                aria-label={`Select ${r.label}`}
              />
              <div className="min-w-0 flex-1">
                <p className={cn('truncate font-medium', disabled && 'font-normal')}>{r.label}</p>
                {r.detail && <p className="truncate text-xs text-muted-foreground">{r.detail}</p>}
              </div>
              {r.badges && <div className="flex shrink-0 items-center gap-1.5">{r.badges}</div>}
            </li>
          );
          return disabled ? (
            <Tooltip key={r.id}>
              <TooltipTrigger asChild>{row}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-72">
                {r.disabledReason}
              </TooltipContent>
            </Tooltip>
          ) : (
            row
          );
        })}
        {visible.length === 0 && (
          <li className="px-3 py-6 text-center text-13 text-muted-foreground">
            No {noun} matches “{query}”.
          </li>
        )}
      </ul>
    </div>
  );
}
