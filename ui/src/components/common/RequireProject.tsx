import { useMemo, type ReactNode } from 'react';
import { FolderGit2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import { useSessionStore } from '@/store/sessionStore';
import { useProjects } from '@/lib/hooks/useProjects';

/**
 * Gate for tools that need a selected project.
 * When no project is chosen, renders an inline picker instead of the tool -
 * so the user never has to hunt for the header dropdown.
 */
export function RequireProject({ children }: { children: ReactNode }) {
  const selectedProject = useSessionStore((s) => s.selectedProject);
  const selectProject = useSessionStore((s) => s.selectProject);
  const organization = useSessionStore((s) => s.organization);

  const { data: projects, isLoading } = useProjects();

  const options = useMemo(
    () => (projects ?? []).map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  if (selectedProject) return <>{children}</>;

  return (
    <div className="flex h-full items-start justify-center px-4 pt-[16vh] sm:px-8">
      <div className="w-full max-w-sm space-y-5 text-center">
        {/* Icon */}
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-primary/25 bg-accent text-accent-foreground">
          <FolderGit2 className="h-5 w-5" />
        </div>

        {/* Copy */}
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold">Pick a project</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {organization ? (
              <>
                Connected to <span className="font-medium text-foreground">{organization}</span>.
                Pick a project to unlock this tool.
              </>
            ) : (
              'Pick a project to unlock this tool.'
            )}
          </p>
        </div>

        {/* Inline picker */}
        {isLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <Combobox
            options={options}
            onChange={(id) => {
              const project = projects?.find((p) => p.id === id) ?? null;
              selectProject(project);
            }}
            placeholder="Choose a project…"
            searchPlaceholder="Search projects…"
            className="w-full"
          />
        )}

        {!isLoading && projects && projects.length === 0 && (
          <p className="text-xs text-muted-foreground/60">
            No projects found in this organization.
          </p>
        )}
      </div>
    </div>
  );
}
