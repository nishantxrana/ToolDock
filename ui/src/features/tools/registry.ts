import {
  CopyPlus,
  ListPlus,
  SearchCode,
  ArrowDownAZ,
  CopyCheck,
  Diff,
  Download,
  FileSpreadsheet,
  GitBranch,
  GitCompareArrows,
  Layers,
  Columns3,
  Workflow,
  Terminal,
} from 'lucide-react';
import type { ToolDefinition } from '@/types/tools';
import { GenerateAppSettings } from './generate-appsettings/GenerateAppSettings';
import { CompareAppSettings } from './compare-appsettings/CompareAppSettings';
import { CsvImport } from './csv-import/CsvImport';
import { ExportGroup } from './export-group/ExportGroup';
import { ExportAllGroups } from './export-all-groups/ExportAllGroups';
import { ReleaseGroupMapping } from './release-group-mapping/ReleaseGroupMapping';
import { ExportReleaseVars } from './export-release-vars/ExportReleaseVars';
import { DuplicateFinder } from './duplicate-finder/DuplicateFinder';
import { SortAppSettings } from './sort-appsettings/SortAppSettings';
import { VariableGroupDiff } from './variable-group-diff/VariableGroupDiff';
import { MultiGroupCompare } from './multi-group-compare/MultiGroupCompare';
import { VariableSearch } from './variable-search/VariableSearch';
import { CopyMissingKeys } from './copy-missing-keys/CopyMissingKeys';
import { CopyGroup } from './copy-group/CopyGroup';

/**
 * The single source of truth for tools. The sidebar and routes are generated
 * from this array - adding a tool means adding one entry here plus its feature
 * component. Built to scale to dozens of tools.
 */
export const TOOLS: readonly ToolDefinition[] = [
  {
    id: 'variable-search',
    title: 'Variable Search',
    description: 'Find a key or value across every variable group in the project.',
    icon: SearchCode,
    group: 'Variable Groups',
    path: '/tools/variable-search',
    component: VariableSearch,
    requiresConnection: true,
  },
  {
    id: 'generate-appsettings',
    title: 'Generate App Service Settings',
    description:
      'Build the -KEY "$(KEY)" string for the App Service Deploy task from one or more groups.',
    icon: Terminal,
    group: 'Variable Groups',
    path: '/tools/generate-appsettings',
    component: GenerateAppSettings,
    requiresConnection: true,
  },
  {
    id: 'compare-appsettings',
    title: 'Compare vs App Settings',
    description:
      'Check pasted App Service settings against variable groups: matched, missing, extra, duplicated.',
    icon: GitCompareArrows,
    group: 'Variable Groups',
    path: '/tools/compare-appsettings',
    component: CompareAppSettings,
    requiresConnection: true,
  },
  {
    id: 'variable-group-diff',
    title: 'Variable Group Diff',
    description:
      'Compare two variable groups key by key, with changed, missing and secret values marked.',
    icon: Diff,
    group: 'Variable Groups',
    path: '/tools/variable-group-diff',
    component: VariableGroupDiff,
    requiresConnection: true,
  },
  {
    id: 'multi-group-compare',
    title: 'Multi-Group Compare',
    description:
      'Line up 2 to 8 variable groups side by side to spot conflicts and missing keys across environments.',
    icon: Columns3,
    group: 'Variable Groups',
    path: '/tools/multi-group-compare',
    component: MultiGroupCompare,
    requiresConnection: true,
  },
  {
    id: 'copy-missing-keys',
    title: 'Copy Missing Keys',
    description: 'Add the keys one variable group has and another lacks, after reviewing each one.',
    icon: ListPlus,
    group: 'Variable Groups',
    path: '/tools/copy-missing-keys',
    component: CopyMissingKeys,
    requiresConnection: true,
    writesToAdo: true,
  },
  {
    id: 'csv-import',
    title: 'CSV Import',
    description:
      'Load Key,Value rows from a CSV into a variable group, after reviewing every change.',
    icon: FileSpreadsheet,
    group: 'Variable Groups',
    path: '/tools/csv-import',
    component: CsvImport,
    requiresConnection: true,
    writesToAdo: true,
  },
  {
    id: 'copy-group',
    title: 'Copy Group to Project',
    description:
      'Create a copy of a variable group in another project, or in this one under a new name.',
    icon: CopyPlus,
    group: 'Variable Groups',
    path: '/tools/copy-group',
    component: CopyGroup,
    requiresConnection: true,
    writesToAdo: true,
  },
  {
    id: 'export-group',
    title: 'Export Variable Group',
    description: 'Download one variable group as CSV, JSON, TXT or an Excel workbook.',
    icon: Download,
    group: 'Variable Groups',
    path: '/tools/export-group',
    component: ExportGroup,
    requiresConnection: true,
  },
  {
    id: 'export-all-groups',
    title: 'Export All Variable Groups',
    description: 'Download a project’s variable groups as one Excel workbook, a sheet per group.',
    icon: Layers,
    group: 'Variable Groups',
    path: '/tools/export-all-groups',
    component: ExportAllGroups,
    requiresConnection: true,
  },
  {
    id: 'export-release-vars',
    title: 'Export Release Variables',
    description:
      'Download a release pipeline’s inline variables, for the whole pipeline or a single stage.',
    icon: GitBranch,
    group: 'Release Pipelines',
    path: '/tools/export-release-vars',
    component: ExportReleaseVars,
    requiresConnection: true,
  },
  {
    id: 'release-group-mapping',
    title: 'Release Pipeline Mapping',
    description:
      'See which release pipelines and stages use each variable group, and export the full list.',
    icon: Workflow,
    group: 'Release Pipelines',
    path: '/tools/release-group-mapping',
    component: ReleaseGroupMapping,
    requiresConnection: true,
  },
  {
    id: 'duplicate-finder',
    title: 'Duplicate Finder',
    description: 'Find keys listed more than once in pasted App Service settings.',
    icon: CopyCheck,
    group: 'App Settings',
    path: '/tools/duplicate-finder',
    component: DuplicateFinder,
    requiresConnection: false,
  },
  {
    id: 'sort-appsettings',
    title: 'Sort App Settings',
    description: 'Sort pasted App Service settings alphabetically, with duplicates removed.',
    icon: ArrowDownAZ,
    group: 'App Settings',
    path: '/tools/sort-appsettings',
    component: SortAppSettings,
    requiresConnection: false,
  },
];

export const DEFAULT_TOOL_PATH = TOOLS[0]!.path;

/** Tool groups in display order. */
export const TOOL_GROUPS = ['Variable Groups', 'Release Pipelines', 'App Settings'] as const;

export function toolsByGroup() {
  return TOOL_GROUPS.map((group) => ({
    group,
    tools: TOOLS.filter((t) => t.group === group),
  }));
}
