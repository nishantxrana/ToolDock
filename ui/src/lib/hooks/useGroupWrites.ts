import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addVariablesToGroup,
  createVariableGroup,
  type VariableGroupCreateBody,
} from '@/lib/api/variableGroups';
import { AdoError } from '@/lib/api/errors';
import type { VariableMap } from '@/types/ado';
import { useSessionStore } from '@/store/sessionStore';

/** 401/403 on a write after reads worked means the token lacks the manage scope. */
function useScopeTracking() {
  const setWritable = useSessionStore((s) => s.setVariableGroupsWritable);
  return {
    onWriteOk: () => setWritable(true),
    onWriteError: (err: unknown) => {
      if (err instanceof AdoError && (err.kind === 'forbidden' || err.kind === 'unauthorized')) {
        setWritable(false);
      }
    },
  };
}

/** Add new keys to a group in the current project (never overwrites). */
export function useAddVariables() {
  const organization = useSessionStore((s) => s.organization);
  const project = useSessionStore((s) => s.selectedProject);
  const queryClient = useQueryClient();
  const { onWriteOk, onWriteError } = useScopeTracking();

  return useMutation({
    mutationFn: ({ groupId, additions }: { groupId: number; additions: VariableMap }) =>
      addVariablesToGroup(organization!, project!.name, groupId, additions),
    onSuccess: () => {
      onWriteOk();
      return queryClient.invalidateQueries({
        queryKey: ['variableGroups', organization, project?.id],
      });
    },
    onError: onWriteError,
  });
}

/** Create a variable group in any project of the organization. */
export function useCreateVariableGroup() {
  const organization = useSessionStore((s) => s.organization);
  const queryClient = useQueryClient();
  const { onWriteOk, onWriteError } = useScopeTracking();

  return useMutation({
    mutationFn: (body: VariableGroupCreateBody) => createVariableGroup(organization!, body),
    onSuccess: (_created, body) => {
      onWriteOk();
      const projectId = body.variableGroupProjectReferences[0]?.projectReference.id;
      return queryClient.invalidateQueries({
        queryKey: ['variableGroups', organization, projectId],
      });
    },
    onError: (err, body) => {
      onWriteError(err);
      // A rejection is usually a name taken since we last looked: re-read the
      // target project's groups so the clash shows next to the name field.
      const projectId = body.variableGroupProjectReferences[0]?.projectReference.id;
      return queryClient.invalidateQueries({
        queryKey: ['variableGroups', organization, projectId],
      });
    },
  });
}
