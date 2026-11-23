import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './ErrorBanner';
import { useVariableGroups } from '@/lib/hooks/useVariableGroups';
import { pluralVars, variableCount } from '@/lib/utils/variables';
import type { VariableGroup } from '@/types/ado';

interface GroupListPickerProps {
  value: VariableGroup[];
  onChange: (groups: VariableGroup[]) => void;
  /** Explains what order means, e.g. "First group wins when keys repeat". */
  orderHint?: string;
}

/** Ordered list of chosen variable groups, with an "add another" picker underneath. */
export function GroupListPicker({ value, onChange, orderHint }: GroupListPickerProps) {
  const { data: allGroups, isLoading, isError, error, refetch } = useVariableGroups();
  // Remount the combobox after each pick so it resets to its placeholder.
  const [pickerKey, setPickerKey] = useState(0);

  const available = useMemo(() => {
    const chosen = new Set(value.map((g) => g.id));
    return (allGroups ?? []).filter((g) => !chosen.has(g.id));
  }, [allGroups, value]);

  if (isLoading) return <Skeleton className="h-9 w-full" />;
  if (isError) return <ErrorBanner error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ol className="divide-y divide-border-subtle overflow-hidden rounded-md border">
          {value.map((g, i) => (
            <li key={g.id} className="flex items-center gap-3 bg-popover py-1.5 pl-3 pr-1.5">
              <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={g.name}>
                {g.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {pluralVars(variableCount(g))}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:bg-destructive-subtle hover:text-destructive"
                onClick={() => onChange(value.filter((x) => x.id !== g.id))}
                aria-label={`Remove ${g.name}`}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      )}

      {available.length > 0 ? (
        <Combobox
          key={pickerKey}
          options={available.map((g) => ({
            value: String(g.id),
            label: g.name,
            description: pluralVars(variableCount(g)),
          }))}
          onChange={(v) => {
            const g = allGroups?.find((x) => x.id === Number(v));
            if (g) {
              onChange([...value, g]);
              setPickerKey((k) => k + 1);
            }
          }}
          placeholder={value.length === 0 ? 'Choose a variable group' : 'Add another group'}
          searchPlaceholder="Search groups"
        />
      ) : (
        value.length > 0 && (
          <p className="text-xs text-muted-foreground">Every group in this project is added.</p>
        )
      )}

      {orderHint && value.length > 1 && (
        <p className="text-xs text-muted-foreground">{orderHint}</p>
      )}
    </div>
  );
}
