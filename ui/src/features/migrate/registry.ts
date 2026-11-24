import { lazy, type ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { GitBranch, KanbanSquare, Layers, Rocket, Ticket } from 'lucide-react';

export interface ScopeNeed {
  name: string;
  why: string;
}

export interface MigrationDefinition {
  id: 'variable-groups' | 'repos' | 'pipelines' | 'boards' | 'jira';
  title: string;
  /** Page heading. */
  heading: string;
  description: string;
  icon: LucideIcon;
  path: string;
  component: ComponentType;
  sourceKind: 'ado' | 'jira';
  /** What gets copied, and what doesn't (shown on the overview). */
  copies: string[];
  skips: string[];
  scopes: { source: ScopeNeed[]; target: ScopeNeed[] };
}

const page = (load: () => Promise<{ default: ComponentType }>) => lazy(load);

export const MIGRATIONS: MigrationDefinition[] = [
  {
    id: 'variable-groups',
    heading: 'Migrate variable groups',
    title: 'Variable groups',
    description:
      'Copy variable groups to another project or organization. Secrets arrive empty, ready to fill.',
    icon: Layers,
    path: '/migrate/variable-groups',
    component: page(() => import('./variable-groups/VariableGroupsMigration')),
    sourceKind: 'ado',
    copies: [
      'Names, descriptions and every variable',
      'Secret variables, created empty for you to fill',
    ],
    skips: [
      'Secret values (Azure DevOps never returns them)',
      'Key Vault-linked groups',
      'Permissions and pipeline authorizations',
    ],
    scopes: {
      source: [
        { name: 'Variable Groups (Read)', why: 'Read the groups' },
        { name: 'Project and Team (Read)', why: 'List projects' },
      ],
      target: [
        { name: 'Variable Groups (Read, create & manage)', why: 'Create the groups' },
        { name: 'Project and Team (Read)', why: 'List projects' },
      ],
    },
  },
  {
    id: 'repos',
    heading: 'Migrate repos',
    title: 'Repos',
    description:
      'Copy Git repositories with every branch, tag and commit. Azure DevOps does the copying, so nothing is downloaded.',
    icon: GitBranch,
    path: '/migrate/repos',
    component: page(() => import('./repos/ReposMigration')),
    sourceKind: 'ado',
    copies: ['All branches, tags and full history', 'Branch policies (optional)'],
    skips: ['Pull requests and their comments', 'Git LFS files', 'Permissions and forks'],
    scopes: {
      source: [
        { name: 'Code (Read)', why: 'Read the repos' },
        { name: 'Project and Team (Read)', why: 'List projects' },
      ],
      target: [
        { name: 'Code (Read, write & manage)', why: 'Create repos and run the import' },
        {
          name: 'Service Connections (Read, query & manage)',
          why: 'A temporary connection the import uses',
        },
      ],
    },
  },
  {
    id: 'pipelines',
    heading: 'Migrate pipelines',
    title: 'Pipelines',
    description:
      'Copy YAML and classic build pipelines, release pipelines and task groups, with agent pools, connections and groups mapped.',
    icon: Rocket,
    path: '/migrate/pipelines',
    component: page(() => import('./pipelines/PipelinesMigration')),
    sourceKind: 'ado',
    copies: [
      'YAML and classic build definitions',
      'Release definitions and their stages',
      'Task groups',
      'Triggers, variables and folders',
    ],
    skips: [
      'Secret variable values',
      'Service connection credentials',
      'Run history and retention',
      'Approvals and environment checks',
    ],
    scopes: {
      source: [
        { name: 'Build (Read)', why: 'Read build pipelines' },
        { name: 'Release (Read)', why: 'Read release pipelines' },
        { name: 'Task Groups (Read)', why: 'Read task groups' },
        { name: 'Agent Pools (Read)', why: 'Resolve agent pools' },
        { name: 'Service Connections (Read)', why: 'Resolve connection names' },
        { name: 'Variable Groups (Read)', why: 'Resolve group names' },
        { name: 'Code (Read)', why: 'Read YAML files' },
      ],
      target: [
        { name: 'Build (Read & execute)', why: 'Create build pipelines' },
        { name: 'Release (Read, write, execute & manage)', why: 'Create release pipelines' },
        { name: 'Task Groups (Read, create & manage)', why: 'Create task groups' },
        { name: 'Environment (Read & manage)', why: 'Create YAML environments' },
        { name: 'Agent Pools (Read)', why: 'Map agent pools' },
        { name: 'Service Connections (Read & query)', why: 'Map connections' },
        { name: 'Variable Groups (Read)', why: 'Map groups' },
        { name: 'Code (Read)', why: 'Find the copied repos' },
      ],
    },
  },
  {
    id: 'boards',
    heading: 'Migrate Boards work items',
    title: 'Boards',
    description:
      'Copy work items with their fields, attachments, comments and links. Map types, states and fields when the processes differ.',
    icon: KanbanSquare,
    path: '/migrate/boards',
    component: page(() => import('./boards/BoardsMigration')),
    sourceKind: 'ado',
    copies: [
      'Work items with mapped types, states and fields',
      'Area and iteration paths',
      'Attachments, inline images and comments',
      'Parent/child and related links',
    ],
    skips: [
      'Revision history',
      'Assignments, unless you turn on user mapping',
      'Boards settings, queries and dashboards',
      'Test plans',
    ],
    scopes: {
      source: [
        { name: 'Work Items (Read)', why: 'Read work items' },
        { name: 'Project and Team (Read)', why: 'List projects' },
      ],
      target: [
        {
          name: 'Work Items (Read, write & manage)',
          why: 'Create work items, areas and iterations',
        },
        { name: 'Project and Team (Read)', why: 'List projects and team members' },
      ],
    },
  },
  {
    id: 'jira',
    heading: 'Migrate Jira to Azure Boards',
    title: 'Jira to Boards',
    description:
      'Copy Jira Cloud issues into Azure Boards, with issue types, statuses, sprints and fields mapped.',
    icon: Ticket,
    path: '/migrate/jira',
    component: page(() => import('./jira/JiraMigration')),
    sourceKind: 'jira',
    copies: [
      'Issues as work items, with mapped types, statuses and fields',
      'Sprints as iterations',
      'Labels and components as tags',
      'Attachments, comments and issue links',
    ],
    skips: [
      'Workflows and automation rules',
      'Worklogs, watchers and votes',
      'Jira dashboards and filters',
      'Assignments, unless you turn on user mapping',
    ],
    scopes: {
      source: [{ name: 'Jira API token', why: 'Read issues (read-only through the proxy)' }],
      target: [
        { name: 'Work Items (Read, write & manage)', why: 'Create work items and iterations' },
        { name: 'Project and Team (Read)', why: 'List projects and team members' },
      ],
    },
  },
];

export const MIGRATE_HOME = '/migrate';

export function migrationFor(pathname: string): MigrationDefinition | undefined {
  return MIGRATIONS.find((m) => m.path === pathname);
}

export function isMigratePath(pathname: string): boolean {
  return pathname === MIGRATE_HOME || pathname.startsWith(`${MIGRATE_HOME}/`);
}
