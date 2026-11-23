import { useMemo, useState } from 'react';
import { Terminal } from 'lucide-react';
import { PageLayout } from '@/components/common/PageLayout';
import { SectionCard } from '@/components/common/SectionCard';
import { OutputBlock } from '@/components/common/OutputBlock';
import { EmptyState } from '@/components/common/EmptyState';
import { Callout } from '@/components/common/Callout';
import { RequireProject } from '@/components/common/RequireProject';
import { GroupListPicker } from '@/components/common/GroupListPicker';
import { Segmented } from '@/components/ui/segmented';
import { formatAppSettings, mergeGroups, type AppSettingsFormat } from '@/lib/utils/appSettings';
import { safeFilename } from '@/lib/utils/download';
import { variableCount, variableNames } from '@/lib/utils/variables';
import type { VariableGroup } from '@/types/ado';

/**
 * Tool 1 - generate the App Service Deploy "App settings" string from one or
 * more variable groups. Keys are merged and deduplicated; duplicates are
 * surfaced as a warning with the source group listed for each conflict.
 */
export function GenerateAppSettings() {
  const [groups, setGroups] = useState<VariableGroup[]>([]);
  const [format, setFormat] = useState<AppSettingsFormat>('oneline');

  const merged = useMemo(
    () => mergeGroups(groups.map((g) => ({ name: g.name, keys: variableNames(g) }))),
    [groups],
  );
  const output = useMemo(() => formatAppSettings(merged.keys, format), [merged.keys, format]);

  const downloadName = useMemo(() => {
    if (groups.length === 0) return 'appsettings.txt';
    if (groups.length === 1) return `${safeFilename(groups[0]?.name ?? '')}-appsettings.txt`;
    return 'combined-appsettings.txt';
  }, [groups]);

  const totalVars = useMemo(() => groups.reduce((sum, g) => sum + variableCount(g), 0), [groups]);

  return (
    <RequireProject>
      <PageLayout
        title="Generate App Service Settings"
        description='Turn one or more variable groups into the -KEY "$(KEY)" string that the App Service Deploy task expects.'
        icon={Terminal}
      >
        <SectionCard
          title="Variable groups"
          description="Keys from every group are merged into one string."
        >
          <GroupListPicker
            value={groups}
            onChange={setGroups}
            orderHint="When a key is in more than one group, it is written once."
          />
        </SectionCard>

        {merged.duplicates.length > 0 && (
          <Callout
            variant="warning"
            title={`${merged.duplicates.length} key${merged.duplicates.length === 1 ? ' is' : 's are'} in more than one group`}
          >
            <p>Each is written once. The groups it came from:</p>
            <ul className="mt-1.5 space-y-0.5 font-mono text-xs">
              {merged.duplicates.map(({ key, groups: gs }) => (
                <li key={key}>
                  <span className="font-medium">{key}</span>
                  <span className="text-muted-foreground"> in {gs.join(', ')}</span>
                </li>
              ))}
            </ul>
          </Callout>
        )}

        {groups.length > 0 ? (
          <OutputBlock
            title="App settings"
            description={
              groups.length > 1
                ? `${merged.keys.length} unique keys from ${totalVars} variables in ${groups.length} groups`
                : `${merged.keys.length} keys`
            }
            value={output}
            downloadName={downloadName}
            actions={
              <Segmented
                label="Layout"
                options={[
                  { value: 'oneline', label: 'One line' },
                  { value: 'multiline', label: 'One per line' },
                ]}
                value={format}
                onChange={setFormat}
              />
            }
            emptyHint="The selected groups have no variables."
          />
        ) : (
          <EmptyState
            icon={Terminal}
            title="Choose a variable group to start"
            description="The settings string appears here, ready to copy into the App Service Deploy task."
          />
        )}
      </PageLayout>
    </RequireProject>
  );
}
