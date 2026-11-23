import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Download, GitCompareArrows } from 'lucide-react';
import { PageLayout } from '@/components/common/PageLayout';
import { SectionCard } from '@/components/common/SectionCard';
import { EmptyState } from '@/components/common/EmptyState';
import { SearchBox } from '@/components/common/SearchBox';
import { CopyButton } from '@/components/common/CopyButton';
import { Callout } from '@/components/common/Callout';
import { RequireProject } from '@/components/common/RequireProject';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { compareKeys } from '@/lib/utils/diff';
import { formatAppSettings, mergeGroups, parseAppSettingsKeys } from '@/lib/utils/appSettings';
import { variableNames } from '@/lib/utils/variables';
import { GroupListPicker } from '@/components/common/GroupListPicker';
import { downloadText, safeFilename } from '@/lib/utils/download';
import { cn } from '@/lib/utils/cn';
import type { VariableGroup } from '@/types/ado';

interface CategoryProps {
  title: string;
  keys: string[];
  variant: BadgeProps['variant'];
  filter: string;
  emptyLabel: string;
  extraAction?: React.ReactNode;
  defaultCollapsed?: boolean;
}

function Category({
  title,
  keys,
  variant,
  filter,
  emptyLabel,
  extraAction,
  defaultCollapsed = false,
}: CategoryProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const filtered = useMemo(
    () => keys.filter((k) => k.toLowerCase().includes(filter.toLowerCase())),
    [keys, filter],
  );

  return (
    <SectionCard
      title={
        <button
          type="button"
          aria-expanded={!collapsed}
          className="-ml-1 flex w-full items-center gap-2 rounded px-1 text-left hover:text-foreground"
          onClick={() => setCollapsed((c) => !c)}
        >
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              !collapsed && 'rotate-90',
            )}
          />
          <span>{title}</span>
          <Badge variant={variant}>{keys.length}</Badge>
        </button>
      }
      actions={
        keys.length > 0 && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {extraAction}
            <CopyButton value={() => keys.join('\n')} iconOnly />
          </div>
        )
      }
      contentClassName="p-0"
    >
      {!collapsed && (
        <>
          {keys.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No matches.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-border-subtle overflow-auto scrollbar-thin">
              {filtered.map((k) => (
                <li key={k} className="px-4 py-1.5 font-mono text-13 hover:bg-row-hover">
                  {k}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </SectionCard>
  );
}

/** Tool 2 - compare one or more variable groups' keys with pasted App Settings. */
export function CompareAppSettings() {
  const [groups, setGroups] = useState<VariableGroup[]>([]);
  const [pasted, setPasted] = useState('');
  const [filter, setFilter] = useState('');

  const merged = useMemo(
    () => mergeGroups(groups.map((g) => ({ name: g.name, keys: variableNames(g) }))),
    [groups],
  );

  const appKeys = useMemo(() => parseAppSettingsKeys(pasted).map((p) => p.key), [pasted]);
  const result = useMemo(() => compareKeys(merged.keys, appKeys), [merged.keys, appKeys]);

  const canCompare = groups.length > 0 && pasted.trim().length > 0;

  const groupLabel =
    groups.length === 1
      ? (groups[0]?.name ?? '')
      : groups.length > 1
        ? `${groups.length} groups`
        : '';

  const isHealthy =
    result.counts.missingFromAppSettings === 0 &&
    result.counts.extraInAppSettings === 0 &&
    result.counts.duplicatesInAppSettings === 0;

  const exportReport = () => {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const status = isHealthy
      ? 'PASS - all keys matched'
      : [
          result.counts.missingFromAppSettings > 0 &&
            `${result.counts.missingFromAppSettings} missing`,
          result.counts.extraInAppSettings > 0 && `${result.counts.extraInAppSettings} extra`,
          result.counts.duplicatesInAppSettings > 0 &&
            `${result.counts.duplicatesInAppSettings} duplicate`,
        ]
          .filter(Boolean)
          .join(', ');

    const missingAsAppSettings =
      result.missingFromAppSettings.length > 0
        ? formatAppSettings(result.missingFromAppSettings, 'multiline')
        : null;

    const lines = [
      `# ToolDock - Variable Group(s) vs App Settings`,
      `Groups  : ${groups.map((g) => g.name).join(', ')}`,
      `Date    : ${now}`,
      `Status  : ${isHealthy ? 'PASS' : 'FAIL'} - ${status}`,
      '',
      `Matched            : ${result.counts.matched}`,
      `Missing from App   : ${result.counts.missingFromAppSettings}`,
      `Extra in App       : ${result.counts.extraInAppSettings}`,
      `Duplicates in App  : ${result.counts.duplicatesInAppSettings}`,
      ...(merged.duplicates.length > 0
        ? [
            '',
            `Duplicate keys across groups (${merged.duplicates.length}):`,
            ...merged.duplicates.map((d) => `  ${d.key} → ${d.groups.join(', ')}`),
          ]
        : []),
      '',
      '─'.repeat(60),
      '',
      `## Missing from App Settings (${result.counts.missingFromAppSettings})`,
      result.counts.missingFromAppSettings === 0
        ? 'None'
        : [
            'Keys in the variable group(s) absent from App Settings.',
            'Add the lines below to the App Service Deploy task:',
            '',
            missingAsAppSettings ?? '',
          ].join('\n'),
      '',
      '─'.repeat(60),
      '',
      `## Extra in App Settings (${result.counts.extraInAppSettings})`,
      result.counts.extraInAppSettings === 0
        ? 'None'
        : [
            'Keys present in App Settings but not in the variable group(s).',
            'Consider removing these unless they are set elsewhere:',
            '',
            ...result.extraInAppSettings,
          ].join('\n'),
      '',
      '─'.repeat(60),
      '',
      `## Duplicates in App Settings (${result.counts.duplicatesInAppSettings})`,
      result.counts.duplicatesInAppSettings === 0
        ? 'None'
        : result.duplicatesInAppSettings.join('\n'),
      '',
      '─'.repeat(60),
      '',
      `## Matched (${result.counts.matched})`,
      result.counts.matched === 0 ? 'None' : result.matched.join('\n'),
    ];

    downloadText(`${safeFilename(groupLabel || 'compare')}-comparison.txt`, lines.join('\n'));
  };

  const exportCsv = () => {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    type Row = { key: string; status: string; note: string };
    const rows: Row[] = [
      ...result.missingFromAppSettings.map((k) => ({
        key: k,
        status: 'Missing from App Settings',
        note: `-${k} "$(${k})"`,
      })),
      ...result.extraInAppSettings.map((k) => ({
        key: k,
        status: 'Extra in App Settings',
        note: 'Present in App Settings but not in variable group(s)',
      })),
      ...result.duplicatesInAppSettings.map((k) => ({
        key: k,
        status: 'Duplicate in App Settings',
        note: 'Key appears more than once in App Settings',
      })),
      ...result.matched.map((k) => ({
        key: k,
        status: 'Matched',
        note: '',
      })),
    ];

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csvLines = [
      `# Groups: ${groups.map((g) => g.name).join(', ')} | Date: ${now} | Status: ${isHealthy ? 'PASS' : 'FAIL'}`,
      ['Key', 'Status', 'Action / Note'].map(escape).join(','),
      ...rows.map((r) => [r.key, r.status, r.note].map(escape).join(',')),
    ];

    downloadText(
      `${safeFilename(groupLabel || 'compare')}-comparison.csv`,
      csvLines.join('\n'),
      'text/csv',
    );
  };

  return (
    <RequireProject>
      <PageLayout
        title="Compare vs App Settings"
        description="Check pasted App Service settings against one or more variable groups: what matches, what is missing, what is extra, and what is listed twice."
        icon={GitCompareArrows}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Multi-group picker */}
          <SectionCard title="Variable groups" description="What the app should receive.">
            <GroupListPicker
              value={groups}
              onChange={setGroups}
              orderHint="Keys are combined across groups before comparing."
            />
          </SectionCard>

          <SectionCard
            title="App settings"
            description="Paste from the App Service Deploy task in your release pipeline."
          >
            <Textarea
              aria-label="App settings"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={'-NODE_ENV "$(NODE_ENV)" -API_URL "$(API_URL)"'}
              className="min-h-[140px]"
            />
          </SectionCard>
        </div>

        {/* Cross-group duplicate warning */}
        {merged.duplicates.length > 0 && (
          <Callout variant="warning">
            <div className="space-y-1.5">
              <p className="font-medium">
                {merged.duplicates.length} key{merged.duplicates.length === 1 ? '' : 's'} appear in
                multiple groups - the first group's key is used for comparison.
              </p>
              <ul className="space-y-0.5 font-mono text-xs">
                {merged.duplicates.map(({ key, groups: gs }) => (
                  <li key={key}>
                    <span className="font-medium">{key}</span>
                    <span className="text-warning/70"> → </span>
                    {gs.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          </Callout>
        )}

        {canCompare ? (
          <>
            {/* Verdict + counts */}
            <div
              role="status"
              className={cn(
                'flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border px-4 py-3',
                isHealthy
                  ? 'border-success-border bg-success-subtle'
                  : 'border-border bg-card shadow-card',
              )}
            >
              <p
                className={cn(
                  'flex items-center gap-2 font-display text-base font-semibold',
                  isHealthy ? 'text-success' : 'text-foreground',
                )}
              >
                {isHealthy ? <CheckCircle2 className="h-5 w-5" /> : null}
                {isHealthy ? 'Every key matches' : 'App settings don’t match the variable groups'}
              </p>
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {(
                  [
                    ['matched', result.counts.matched, 'text-foreground'],
                    ['missing', result.counts.missingFromAppSettings, 'text-warning'],
                    ['extra', result.counts.extraInAppSettings, 'text-info'],
                    ['duplicated', result.counts.duplicatesInAppSettings, 'text-destructive'],
                  ] as const
                ).map(([label, n, toneClass]) => (
                  <div key={label} className="flex items-baseline gap-1.5">
                    <dt className="sr-only">{label}</dt>
                    <dd
                      className={cn(
                        'font-display text-lg font-semibold tabular-nums',
                        n > 0 ? toneClass : 'text-foreground',
                      )}
                    >
                      {n}
                    </dd>
                    <span className="text-muted-foreground">{label}</span>
                  </div>
                ))}
              </dl>
              {groups.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  {merged.keys.length} unique keys across {groups.length} groups
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SearchBox
                value={filter}
                onChange={setFilter}
                placeholder="Filter keys"
                className="w-full sm:max-w-xs"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Save report as</span>
                <Button variant="outline" size="sm" onClick={exportReport}>
                  <Download />
                  TXT
                </Button>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download />
                  CSV
                </Button>
              </div>
            </div>

            <div className="grid items-start gap-5 md:grid-cols-2">
              <Category
                title="Matched"
                keys={result.matched}
                variant="success"
                filter={filter}
                emptyLabel="No key is in both."
                defaultCollapsed={result.counts.matched > 0}
              />
              <Category
                title="Missing from app settings"
                keys={result.missingFromAppSettings}
                variant="warning"
                filter={filter}
                emptyLabel="Nothing missing."
                extraAction={
                  result.missingFromAppSettings.length > 0 && (
                    <CopyButton
                      value={() => formatAppSettings(result.missingFromAppSettings, 'multiline')}
                      label="Copy as settings"
                      size="sm"
                    />
                  )
                }
              />
              <Category
                title="Extra in app settings"
                keys={result.extraInAppSettings}
                variant="info"
                filter={filter}
                emptyLabel="Nothing extra."
              />
              <Category
                title="Listed twice in app settings"
                keys={result.duplicatesInAppSettings}
                variant="destructive"
                filter={filter}
                emptyLabel="No duplicates."
              />
            </div>
          </>
        ) : (
          <EmptyState
            icon={GitCompareArrows}
            title="Add a group and paste your settings"
            description="The result appears here once both sides are filled in."
          />
        )}
      </PageLayout>
    </RequireProject>
  );
}
