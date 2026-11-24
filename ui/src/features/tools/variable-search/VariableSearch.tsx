import { useDeferredValue, useMemo, useState } from 'react';
import { Download, SearchCode } from 'lucide-react';
import { PageLayout } from '@/components/common/PageLayout';
import { SectionCard } from '@/components/common/SectionCard';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { RequireProject } from '@/components/common/RequireProject';
import { ValueCell } from '@/components/common/ValueCell';
import { Callout } from '@/components/common/Callout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useVariableGroups } from '@/lib/hooks/useVariableGroups';
import {
  highlightParts,
  searchVariableGroups,
  type SearchMatch,
  type SearchScope,
} from '@/lib/utils/variableSearch';
import { downloadText, safeFilename } from '@/lib/utils/download';
import { useSessionStore } from '@/store/sessionStore';
import { cn } from '@/lib/utils/cn';

/** Cap on rendered rows so a one-letter query over thousands of variables stays fast. */
const MAX_ROWS = 500;

function Highlighted({
  text,
  query,
  caseSensitive,
}: {
  text: string;
  query: string;
  caseSensitive: boolean;
}) {
  return (
    <>
      {highlightParts(text, query, caseSensitive).map((p, i) =>
        p.hit ? (
          <mark
            key={i}
            className="rounded-sm bg-warning-subtle px-px text-foreground ring-1 ring-warning-border"
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function toCsv(matches: SearchMatch[]): string {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [
    'Group,Key,Value,Secret',
    ...matches.map((m) =>
      [m.groupName, m.key, m.value ?? '', m.isSecret ? 'yes' : ''].map(esc).join(','),
    ),
  ].join('\n');
}

/** Search every variable group in the project by key and/or value. */
export function VariableSearch() {
  const project = useSessionStore((s) => s.selectedProject);
  const { data: groups, isLoading, isError, error, refetch } = useVariableGroups();

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('both');
  const [exact, setExact] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const matches = useMemo(
    () => searchVariableGroups(groups ?? [], deferredQuery, { scope, exact, caseSensitive }),
    [groups, deferredQuery, scope, exact, caseSensitive],
  );
  const groupCount = useMemo(() => new Set(matches.map((m) => m.groupId)).size, [matches]);
  const totalVars = useMemo(
    () => (groups ?? []).reduce((n, g) => n + Object.keys(g.variables ?? {}).length, 0),
    [groups],
  );
  const secretKeyHits = matches.filter((m) => m.isSecret).length;
  const hasQuery = deferredQuery.trim().length > 0;

  return (
    <RequireProject>
      <PageLayout
        title="Variable Search"
        description="Find variables across every group in this project by name or value, for example every group that sets Redis__Host, or everywhere sql-prod-01 is used."
        icon={SearchCode}
      >
        {isError && <ErrorBanner error={error} onRetry={() => refetch()} />}

        <SectionCard>
          <div className="space-y-3">
            <Input
              autoFocus
              type="search"
              aria-label="Search variables"
              placeholder="Key or value, like Redis__Host or sql-prod-01"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 font-mono text-sm"
            />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Segmented
                label="Search in"
                options={[
                  { value: 'both', label: 'Keys and values' },
                  { value: 'keys', label: 'Keys' },
                  { value: 'values', label: 'Values' },
                ]}
                value={scope}
                onChange={setScope}
              />
              <label className="flex cursor-pointer items-center gap-2 text-13">
                <Checkbox checked={exact} onCheckedChange={(v) => setExact(v === true)} />
                Whole match only
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-13">
                <Checkbox
                  checked={caseSensitive}
                  onCheckedChange={(v) => setCaseSensitive(v === true)}
                />
                Match case
              </label>
              <span className="ml-auto text-xs text-muted-foreground">
                {isLoading
                  ? 'Loading groups'
                  : `${groups?.length ?? 0} groups, ${totalVars} variables in ${project?.name ?? 'this project'}`}
              </span>
            </div>
          </div>
        </SectionCard>

        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !hasQuery ? (
          <EmptyState
            icon={SearchCode}
            title="Type to search every group"
            description="Matches show up as you type. Secret values can’t be read from Azure DevOps, so secrets are only found by their key."
          />
        ) : matches.length === 0 ? (
          <EmptyState
            icon={SearchCode}
            title={`Nothing matches “${deferredQuery.trim()}”`}
            description={
              exact
                ? 'Whole match is on, so only exact keys or values count. Turn it off to match part of a name.'
                : scope === 'values'
                  ? 'Only values are searched. Try “Keys and values”.'
                  : 'Check the spelling, or search for a shorter part of the name.'
            }
          />
        ) : (
          <SectionCard
            title={`${matches.length} match${matches.length === 1 ? '' : 'es'} in ${groupCount} group${groupCount === 1 ? '' : 's'}`}
            description={
              secretKeyHits > 0 && scope !== 'keys'
                ? secretKeyHits === 1
                  ? 'One is a secret, matched by its key only.'
                  : `${secretKeyHits} are secrets, matched by their keys only.`
                : undefined
            }
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadText(
                    `${safeFilename(project?.name ?? 'variables')}-search-${safeFilename(deferredQuery.trim())}.csv`,
                    toCsv(matches),
                    'text/csv',
                  )
                }
              >
                <Download />
                Export CSV
              </Button>
            }
            contentClassName="p-0"
          >
            {matches.length > MAX_ROWS && (
              <Callout variant="info" className="m-3">
                Showing the first {MAX_ROWS} of {matches.length}. The CSV has all of them; narrow
                the search to see the rest here.
              </Callout>
            )}
            <div className="max-h-[60vh] overflow-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[24%] pl-4">Group</TableHead>
                    <TableHead className="w-[32%]">Key</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.slice(0, MAX_ROWS).map((m, i) => {
                    const sameGroupAsAbove = i > 0 && matches[i - 1]!.groupId === m.groupId;
                    return (
                      <TableRow key={`${m.groupId}:${m.key}`}>
                        <TableCell
                          className={cn(
                            'pl-4 font-medium',
                            sameGroupAsAbove && 'text-transparent [&_*]:text-transparent',
                          )}
                          aria-label={sameGroupAsAbove ? m.groupName : undefined}
                        >
                          <span className="[overflow-wrap:anywhere]">{m.groupName}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs [overflow-wrap:anywhere]">
                          {m.matchedKey ? (
                            <Highlighted
                              text={m.key}
                              query={deferredQuery}
                              caseSensitive={caseSensitive}
                            />
                          ) : (
                            m.key
                          )}
                        </TableCell>
                        <TableCell>
                          {m.matchedValue && m.value ? (
                            <span className="font-mono text-xs [overflow-wrap:anywhere]">
                              <Highlighted
                                text={m.value}
                                query={deferredQuery}
                                caseSensitive={caseSensitive}
                              />
                            </span>
                          ) : (
                            <ValueCell value={m.value} secret={m.isSecret} />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        )}
      </PageLayout>
    </RequireProject>
  );
}
