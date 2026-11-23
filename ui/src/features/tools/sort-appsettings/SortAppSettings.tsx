import { useMemo, useState } from 'react';
import { ArrowDownAZ } from 'lucide-react';
import { PageLayout } from '@/components/common/PageLayout';
import { SectionCard } from '@/components/common/SectionCard';
import { OutputBlock } from '@/components/common/OutputBlock';
import { Textarea } from '@/components/ui/textarea';
import { Segmented } from '@/components/ui/segmented';
import {
  distinctKeys,
  formatAppSettings,
  parseAppSettingsKeys,
  type AppSettingsFormat,
} from '@/lib/utils/appSettings';

/** Tool 6 - paste App Settings (one-line or multiline) and get them sorted alphabetically. */
export function SortAppSettings() {
  const [input, setInput] = useState('');
  const [oneLine, setOneLine] = useState(true);

  const parsed = useMemo(() => parseAppSettingsKeys(input), [input]);
  const sortedKeys = useMemo(() => {
    const keys = distinctKeys(parsed);
    return [...keys].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [parsed]);

  const format: AppSettingsFormat = oneLine ? 'oneline' : 'multiline';
  const output = useMemo(
    () => (sortedKeys.length > 0 ? formatAppSettings(sortedKeys, format) : ''),
    [sortedKeys, format],
  );

  return (
    <PageLayout
      title="Sort App Settings"
      description="Paste App Service settings and get them back in alphabetical order, with duplicates removed. Works without a connection."
      icon={ArrowDownAZ}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="App settings"
          description={sortedKeys.length > 0 ? `${sortedKeys.length} unique keys` : undefined}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              '-NODE_ENV "$(NODE_ENV)" -JWT_SECRET "$(JWT_SECRET)" -API_URL "$(API_URL)"'
            }
            className="min-h-[360px]"
            aria-label="App settings"
            autoFocus
          />
        </SectionCard>

        <OutputBlock
          title="Sorted settings"
          value={output}
          downloadName="app-settings-sorted.txt"
          emptyHint="Paste settings to see them sorted."
          actions={
            <Segmented
              label="Layout"
              options={[
                { value: 'oneline', label: 'One line' },
                { value: 'multiline', label: 'One per line' },
              ]}
              value={oneLine ? 'oneline' : 'multiline'}
              onChange={(v) => setOneLine(v === 'oneline')}
            />
          }
        />
      </div>
    </PageLayout>
  );
}
