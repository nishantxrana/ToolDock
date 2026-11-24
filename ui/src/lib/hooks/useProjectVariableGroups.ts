import { useQuery } from '@tanstack/react-query';
import { listVariableGroups } from '@/lib/api/variableGroups';
import { useSessionStore } from '@/store/sessionStore';
import type { Project } from '@/types/ado';

/**
 * Variable groups of any project (not just the selected one). Shares the cache
 * key with useVariableGroups, so the selected project's groups aren't fetched twice.
 */
export function useProjectVariableGroups(project: Project | null) {
  const organization = useSessionStore((s) => s.organization);
  return useQuery({
    queryKey: ['variableGroups', organization, project?.id],
    queryFn: ({ signal }) => listVariableGroups(organization!, project!.name, signal),
    enabled: !!organization && !!project,
    staleTime: 60 * 1000,
  });
}
