import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import { useProjects } from '@/lib/hooks/useProjects';
import { useSessionStore } from '@/store/sessionStore';

/** Header control to pick the active project. Selection lives in memory only. */
export function ProjectSelector() {
  const { data: projects, isLoading, isError, refetch } = useProjects();
  const selectedProject = useSessionStore((s) => s.selectedProject);
  const selectProject = useSessionStore((s) => s.selectProject);

  const options = useMemo(
    () => (projects ?? []).map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  if (isLoading) return <Skeleton className="h-8 w-36 sm:w-52" />;
  if (isError || !projects) {
    return (
      <button
        type="button"
        onClick={() => refetch()}
        className="h-8 rounded-md px-2 text-13 text-destructive hover:bg-destructive-subtle"
      >
        Couldn’t load projects. Retry
      </button>
    );
  }

  return (
    <Combobox
      options={options}
      value={selectedProject?.id ?? undefined}
      onChange={(id) => {
        const project = projects.find((p) => p.id === id) ?? null;
        selectProject(project);
      }}
      placeholder="Choose project"
      searchPlaceholder="Search projects"
      className="h-8 w-40 text-13 sm:w-52"
      contentClassName="w-64"
    />
  );
}
