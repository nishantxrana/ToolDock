import { useEffect, useMemo, useState } from 'react';
import { CopyPlus, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { PageLayout } from '@/components/common/PageLayout';
import { SectionCard } from '@/components/common/SectionCard';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { RequireProject } from '@/components/common/RequireProject';
import { Callout } from '@/components/common/Callout';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Field } from '@/components/common/Field';
import { VariableGroupPicker } from '@/components/common/VariableGroupPicker';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjects } from '@/lib/hooks/useProjects';
import { useProjectVariableGroups } from '@/lib/hooks/useProjectVariableGroups';
import { useCreateVariableGroup } from '@/lib/hooks/useGroupWrites';
import {
  invalidGroupName,
  isKeyVaultGroup,
  nameTaken,
  planGroupCopy,
  type SecretMode,
} from '@/lib/utils/groupCopy';
import { pluralVars } from '@/lib/utils/variables';
import { errorMessage, errorTitle } from '@/lib/api/errors';
import { useSessionStore } from '@/store/sessionStore';
import type { Project, VariableGroup } from '@/types/ado';

/** Create a copy of a variable group in another project (or in this one under a new name). */
export function CopyGroup() {
  const currentProject = useSessionStore((s) => s.selectedProject);
  const writeDenied = useSessionStore((s) => s.variableGroupsWritable) === false;
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const create = useCreateVariableGroup();

  const [source, setSource] = useState<VariableGroup | null>(null);
  const [targetProject, setTargetProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [secretMode, setSecretMode] = useState<SecretMode>('placeholder');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Default the new name to the source's name whenever the source changes.
  useEffect(() => setName(source?.name ?? ''), [source]);

  const targetGroups = useProjectVariableGroups(targetProject);
  const plan = useMemo(
    () => (source ? planGroupCopy(source, secretMode) : null),
    [source, secretMode],
  );

  const sameProject = targetProject?.id === currentProject?.id;
  const nameError = invalidGroupName(name);
  const clash = !nameError && targetGroups.data ? nameTaken(name, targetGroups.data) : false;
  const keyVault = source ? isKeyVaultGroup(source) : false;
  const ready =
    !!source &&
    !!targetProject &&
    !!plan &&
    !nameError &&
    !clash &&
    !keyVault &&
    targetGroups.isSuccess;

  const run = () => {
    if (!source || !targetProject || !plan) return;
    create.mutate(
      {
        name: name.trim(),
        description: source.description ?? '',
        type: 'Vsts',
        variables: plan.variables,
        variableGroupProjectReferences: [
          {
            name: name.trim(),
            description: source.description ?? '',
            projectReference: { id: targetProject.id, name: targetProject.name },
          },
        ],
      },
      {
        onSuccess: (created) => {
          setConfirmOpen(false);
          const emptySecrets = secretMode === 'placeholder' ? plan.secrets.length : 0;
          toast.success(`Created ${created.name} in ${targetProject.name}`, {
            description:
              emptySecrets > 0
                ? `${emptySecrets} secret${emptySecrets === 1 ? ' is' : 's are'} empty. Fill ${emptySecrets === 1 ? 'it' : 'them'} in under Pipelines, Library.`
                : undefined,
          });
        },
        onError: (err) => {
          setConfirmOpen(false);
          toast.error(errorTitle(err), { description: errorMessage(err) });
        },
      },
    );
  };

  return (
    <RequireProject>
      <PageLayout
        title="Copy Group to Project"
        description="Create a copy of a variable group in another project in this organization, or in this project under a new name. Pipeline permissions aren’t copied."
        icon={CopyPlus}
      >
        <SectionCard title="Copy">
          <VariableGroupPicker
            label="Variable group"
            value={source?.id ?? null}
            onChange={(_, g) => setSource(g)}
          />
        </SectionCard>

        {!source ? (
          <EmptyState
            icon={CopyPlus}
            title="Choose a group to copy"
            description="Then pick where the copy goes. You confirm before anything is created."
          />
        ) : keyVault ? (
          <Callout variant="warning" title={`${source.name} is linked to Azure Key Vault`}>
            Its variables come from a vault through a service connection, which this tool can’t
            recreate. Create the new group in Azure DevOps and link it to the vault there.
          </Callout>
        ) : (
          <>
            <SectionCard title="To">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Project">
                  {projectsLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Combobox
                      options={(projects ?? []).map((p) => ({
                        value: p.id,
                        label: p.name,
                        description: p.id === currentProject?.id ? 'this project' : undefined,
                      }))}
                      value={targetProject?.id}
                      onChange={(id) =>
                        setTargetProject(projects?.find((p) => p.id === id) ?? null)
                      }
                      placeholder="Choose a project"
                      searchPlaceholder="Search projects"
                    />
                  )}
                </Field>
                <Field
                  label="New group name"
                  hint={
                    nameError
                      ? undefined
                      : clash
                        ? undefined
                        : sameProject
                          ? 'Must differ from every group already in this project.'
                          : undefined
                  }
                >
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={!!nameError || clash}
                    className={
                      clash || nameError
                        ? 'border-destructive focus-visible:border-destructive'
                        : undefined
                    }
                  />
                </Field>
              </div>
              {targetProject && targetGroups.isLoading && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Checking names in {targetProject.name}
                </p>
              )}
              {targetGroups.isError && (
                <ErrorBanner
                  className="mt-3"
                  error={targetGroups.error}
                  onRetry={() => targetGroups.refetch()}
                />
              )}
              {(nameError || clash) && targetProject && (
                <p className="mt-2 text-13 text-destructive" role="alert">
                  {nameError ??
                    `${targetProject.name} already has a group named “${name.trim()}”. Choose another name.`}
                </p>
              )}
            </SectionCard>

            {plan && (
              <SectionCard
                title="What gets copied"
                description={`${pluralVars(plan.copiedCount)} with values${source.description ? ', plus the description' : ''}.`}
              >
                {plan.secrets.length === 0 ? (
                  <p className="text-13 text-muted-foreground">This group has no secrets.</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-13">
                      {plan.secrets.length} secret{plan.secrets.length === 1 ? '' : 's'} can’t be
                      copied with
                      {plan.secrets.length === 1 ? ' its value' : ' their values'}, because Azure
                      DevOps doesn’t return secret values:
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {plan.secrets.map((k) => (
                        <li
                          key={k}
                          className="inline-flex items-center gap-1.5 rounded-md border bg-popover px-2 py-1 font-mono text-xs"
                        >
                          <Lock className="h-3 w-3 text-info" aria-hidden />
                          {k}
                        </li>
                      ))}
                    </ul>
                    <Segmented
                      label="Secrets"
                      options={[
                        { value: 'placeholder', label: 'Add as empty secrets' },
                        { value: 'skip', label: 'Leave them out' },
                      ]}
                      value={secretMode}
                      onChange={setSecretMode}
                    />
                  </div>
                )}
              </SectionCard>
            )}

            {writeDenied && (
              <Callout variant="warning">
                Your token can read groups but not create them. Reconnect with a token that has the
                Variable Groups <strong>Read, create, &amp; manage</strong> scope.
              </Callout>
            )}

            <div className="flex justify-end">
              <Button
                disabled={!ready || writeDenied || create.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                <CopyPlus />
                Create copy
              </Button>
            </div>
          </>
        )}
      </PageLayout>

      {source && targetProject && plan && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Create ${name.trim()} in ${targetProject.name}?`}
          description="This creates a new variable group in Azure DevOps. Nothing in the original group changes."
          confirmLabel="Create copy"
          confirmLoading={create.isPending}
          onConfirm={run}
        >
          <ul className="space-y-1 text-13">
            <li>{pluralVars(plan.copiedCount)} copied with values</li>
            {plan.secrets.length > 0 && (
              <li>
                {plan.secrets.length} secret{plan.secrets.length === 1 ? '' : 's'}{' '}
                {secretMode === 'placeholder' ? 'added empty, to fill in afterwards' : 'left out'}
              </li>
            )}
            <li className="text-muted-foreground">
              Pipelines in {targetProject.name} need permission to use the new group before they can
              run with it.
            </li>
          </ul>
        </ConfirmDialog>
      )}
    </RequireProject>
  );
}
