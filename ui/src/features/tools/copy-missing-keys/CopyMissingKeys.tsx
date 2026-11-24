import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ListPlus, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { PageLayout } from '@/components/common/PageLayout';
import { SectionCard } from '@/components/common/SectionCard';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { RequireProject } from '@/components/common/RequireProject';
import { Callout } from '@/components/common/Callout';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Field } from '@/components/common/Field';
import { ValueCell } from '@/components/common/ValueCell';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useVariableGroups } from '@/lib/hooks/useVariableGroups';
import { useAddVariables } from '@/lib/hooks/useGroupWrites';
import { buildMissingKeysUpdate, isKeyVaultGroup, planMissingKeys } from '@/lib/utils/groupCopy';
import { pluralVars, variableCount } from '@/lib/utils/variables';
import { errorMessage, errorTitle } from '@/lib/api/errors';
import { useSessionStore } from '@/store/sessionStore';
import type { VariableGroup, VariableMap } from '@/types/ado';

/**
 * Copy keys that one group has and another lacks. Only adds; never changes or
 * removes a variable that already exists in the target.
 */
export function CopyMissingKeys() {
  const { data: groups, isLoading, isError, error, refetch } = useVariableGroups();
  const writeDenied = useSessionStore((s) => s.variableGroupsWritable) === false;
  const mutation = useAddVariables();
  const [params, setParams] = useSearchParams();

  const sourceId = Number(params.get('from')) || null;
  const targetId = Number(params.get('to')) || null;
  const source = groups?.find((g) => g.id === sourceId) ?? null;
  const target = groups?.find((g) => g.id === targetId) ?? null;

  const setSide = (side: 'from' | 'to', id: number | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id === null) next.delete(side);
        else next.set(side, String(id));
        return next;
      },
      { replace: true },
    );

  const plan = useMemo(
    () => (source && target ? planMissingKeys(source, target) : null),
    [source, target],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [withSecrets, setWithSecrets] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // New pair of groups: start with every copyable key ticked, secrets unticked.
  useEffect(() => {
    setSelected(new Set(plan?.copyable.map((c) => c.key) ?? []));
    setWithSecrets(false);
  }, [plan]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const chosenValues = plan ? plan.copyable.filter((c) => selected.has(c.key)) : [];
  const chosenSecrets = plan && withSecrets ? plan.secrets.filter((k) => selected.has(k)) : [];
  const chosenCount = chosenValues.length + chosenSecrets.length;
  const targetIsKeyVault = target ? isKeyVaultGroup(target) : false;

  const additions = (): VariableMap => {
    if (!plan || !target) return {};
    const full = buildMissingKeysUpdate({ variables: {} }, plan, selected, withSecrets);
    return full;
  };

  const run = () => {
    if (!target) return;
    mutation.mutate(
      { groupId: target.id, additions: additions() },
      {
        onSuccess: ({ added, skipped }) => {
          setConfirmOpen(false);
          const addedSecrets = chosenSecrets.filter((k) => added.includes(k)).length;
          const notes = [
            skipped.length > 0 &&
              `${skipped.length === 1 ? `${skipped[0]} was` : `${skipped.length} keys were`} skipped: ${skipped.length === 1 ? 'it was' : 'they were'} added to ${target.name} by someone else in the meantime${skipped.length > 1 ? ` (${skipped.join(', ')})` : ''}.`,
            addedSecrets > 0 &&
              `${addedSecrets === 1 ? 'The secret is' : `${addedSecrets} secrets are`} empty; fill ${addedSecrets === 1 ? 'it' : 'them'} in under Pipelines, Library.`,
          ].filter(Boolean);
          const title =
            added.length > 0
              ? `Added ${pluralVars(added.length)} to ${target.name}`
              : `Nothing added to ${target.name}`;
          toast.success(title, { description: notes.length ? notes.join(' ') : undefined });
        },
        onError: (err) => {
          setConfirmOpen(false);
          toast.error(errorTitle(err), { description: errorMessage(err) });
        },
      },
    );
  };

  const picker = (side: 'from' | 'to', value: VariableGroup | null, exclude: number | null) => (
    <Field label={side === 'from' ? 'Copy from' : 'Into'} className="min-w-0 flex-1">
      <Combobox
        options={(groups ?? [])
          .filter((g) => g.id !== exclude)
          .map((g) => ({
            value: String(g.id),
            label: g.name,
            description: pluralVars(variableCount(g)),
          }))}
        value={value ? String(value.id) : undefined}
        onChange={(v) => setSide(side, Number(v))}
        placeholder={side === 'from' ? 'Group that has the keys' : 'Group that is missing them'}
        searchPlaceholder="Search groups"
      />
    </Field>
  );

  return (
    <RequireProject>
      <PageLayout
        title="Copy Missing Keys"
        description="Add the keys one group has and another lacks, for example to bring prod up to date with staging. Only adds keys; nothing already in the target group is changed."
        icon={ListPlus}
      >
        {isError && <ErrorBanner error={error} onRetry={() => refetch()} />}

        <SectionCard title="Groups">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              {picker('from', source, targetId)}
              <ArrowDown
                className="mx-auto h-4 w-4 shrink-0 text-muted-foreground sm:mb-2.5 sm:-rotate-90"
                aria-hidden
              />
              {picker('to', target, sourceId)}
            </div>
          )}
        </SectionCard>

        {targetIsKeyVault ? (
          <Callout variant="warning" title={`${target!.name} is linked to Azure Key Vault`}>
            Its variables come from the vault, so keys can’t be added here. Add the secrets to the
            vault instead, then refresh the group in Azure DevOps.
          </Callout>
        ) : !plan || !source || !target ? (
          <EmptyState
            icon={ListPlus}
            title="Choose the two groups"
            description="Pick the group that has the keys, then the group that’s missing them. You review the list before anything is written."
          />
        ) : plan.copyable.length === 0 && plan.secrets.length === 0 ? (
          <Callout variant="success" title="Nothing to copy">
            Every key in {source.name} already exists in {target.name}.
          </Callout>
        ) : (
          <>
            {writeDenied && (
              <Callout variant="warning">
                Your token can read groups but not change them, so adding is turned off. Reconnect
                with a token that has the Variable Groups{' '}
                <strong>Read, create, &amp; manage</strong> scope.
              </Callout>
            )}

            {plan.copyable.length > 0 && (
              <SectionCard
                title={`Missing from ${target.name}`}
                description={`${plan.copyable.length} key${plan.copyable.length === 1 ? '' : 's'} with values from ${source.name}. ${plan.sharedCount} shared key${plan.sharedCount === 1 ? ' is' : 's are'} left as they are.`}
                contentClassName="p-0"
              >
                <label className="flex cursor-pointer items-center gap-3 border-b border-border-subtle bg-muted/50 px-4 py-2 text-13 font-medium">
                  <Checkbox
                    checked={
                      chosenValues.length === plan.copyable.length
                        ? true
                        : chosenValues.length > 0
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={(v) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        plan.copyable.forEach((c) =>
                          v === true ? next.add(c.key) : next.delete(c.key),
                        );
                        return next;
                      })
                    }
                  />
                  Select all
                </label>
                <ul className="max-h-[50vh] overflow-y-auto scrollbar-thin">
                  {plan.copyable.map((c) => (
                    <li key={c.key}>
                      <label className="grid cursor-pointer grid-cols-[auto_minmax(0,2fr)_minmax(0,3fr)] items-start gap-3 border-b border-border-subtle px-4 py-2 last:border-0 hover:bg-row-hover">
                        <Checkbox
                          className="mt-0.5"
                          checked={selected.has(c.key)}
                          onCheckedChange={() => toggle(c.key)}
                        />
                        <span className="font-mono text-xs font-medium [overflow-wrap:anywhere]">
                          {c.key}
                        </span>
                        <ValueCell value={c.value} />
                      </label>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            {plan.secrets.length > 0 && (
              <SectionCard
                title={`Secrets missing from ${target.name}`}
                description="Secret values can’t be read from Azure DevOps, so they can’t be copied."
              >
                <ul className="mb-3 flex flex-wrap gap-1.5">
                  {plan.secrets.map((k) => (
                    <li key={k}>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-popover px-2 py-1 font-mono text-xs">
                        {withSecrets ? (
                          <Checkbox checked={selected.has(k)} onCheckedChange={() => toggle(k)} />
                        ) : (
                          <Lock className="h-3 w-3 text-info" aria-hidden />
                        )}
                        {k}
                      </label>
                    </li>
                  ))}
                </ul>
                <label className="flex cursor-pointer items-start gap-2 text-13">
                  <Checkbox
                    className="mt-0.5"
                    checked={withSecrets}
                    onCheckedChange={(v) => {
                      const on = v === true;
                      setWithSecrets(on);
                      setSelected((prev) => {
                        const next = new Set(prev);
                        plan.secrets.forEach((k) => (on ? next.add(k) : next.delete(k)));
                        return next;
                      });
                    }}
                  />
                  <span>
                    Add them to {target.name} as empty secrets, so you can fill in each value in
                    Azure DevOps afterwards.
                  </span>
                </label>
              </SectionCard>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3">
              <p className="text-13 text-muted-foreground">
                {chosenCount === 0
                  ? 'Nothing selected'
                  : `${pluralVars(chosenCount)} will be added to ${target.name}`}
              </p>
              {writeDenied ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button disabled>
                        <ListPlus />
                        Add to {target.name}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Your token can’t change variable groups.</TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  disabled={chosenCount === 0 || mutation.isPending}
                  onClick={() => setConfirmOpen(true)}
                >
                  <ListPlus />
                  Add to {target.name}
                </Button>
              )}
            </div>
          </>
        )}
      </PageLayout>

      {target && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Add ${pluralVars(chosenCount)} to ${target.name}?`}
          description="This writes to Azure DevOps. Existing variables in the group aren’t changed."
          confirmLabel={`Add ${pluralVars(chosenCount)}`}
          confirmLoading={mutation.isPending}
          onConfirm={run}
        >
          <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-xs scrollbar-thin">
            {chosenValues.map((c) => (
              <li key={c.key} className="[overflow-wrap:anywhere]">
                {c.key}
              </li>
            ))}
            {chosenSecrets.map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <Lock className="h-3 w-3 text-info" aria-hidden />
                {k} <span className="font-sans text-muted-foreground">(empty secret)</span>
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </RequireProject>
  );
}
