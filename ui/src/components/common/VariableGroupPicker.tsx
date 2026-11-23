import { useMemo } from 'react';
import { Boxes } from 'lucide-react';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from './ErrorBanner';
import { EmptyState } from './EmptyState';
import { Field } from './Field';
import { useVariableGroups } from '@/lib/hooks/useVariableGroups';
import { pluralVars, variableCount } from '@/lib/utils/variables';
import type { VariableGroup } from '@/types/ado';

interface VariableGroupPickerProps {
  value: number | null;
  onChange: (groupId: number, group: VariableGroup) => void;
  label?: string;
}

/** Searchable dropdown to select one of the project's variable groups. */
export function VariableGroupPicker({
  value,
  onChange,
  label = 'Variable group',
}: VariableGroupPickerProps) {
  const { data: groups, isLoading, isError, error, refetch } = useVariableGroups();

  const options = useMemo(
    () =>
      (groups ?? []).map((g) => ({
        value: String(g.id),
        label: g.name,
        description: pluralVars(variableCount(g)),
      })),
    [groups],
  );

  if (isLoading) return <Skeleton className="h-9 w-full max-w-md" />;
  if (isError) return <ErrorBanner error={error} onRetry={() => refetch()} />;
  if (!groups || groups.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="No variable groups in this project"
        description="Create one in Azure DevOps under Pipelines, Library. If you expected some here, check that your token has Variable Groups read access."
      />
    );
  }

  return (
    <Field label={label} className="max-w-md">
      <Combobox
        options={options}
        value={value !== null ? String(value) : undefined}
        onChange={(v) => {
          const id = Number(v);
          const group = groups.find((g) => g.id === id);
          if (group) onChange(id, group);
        }}
        placeholder="Choose a variable group"
        searchPlaceholder="Search groups"
      />
    </Field>
  );
}
