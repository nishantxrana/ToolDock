import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dedupeReport,
  groupBySeverity,
  reportToCsv,
  reportToMarkdown,
  type ReportItem,
} from '@/lib/migration/report';
import { adoLinks, marketplaceLink } from '@/lib/migration/links';
import {
  formatLockTime,
  lockLevel,
  speakLockTime,
  tickInterval,
} from '@/lib/hooks/useLockCountdown';
import { LOCK_EXPIRY_MS } from '@/lib/utils/patVault';

const items: ReportItem[] = [
  {
    area: 'Variable groups',
    severity: 'action',
    title: 'Fill secret value',
    detail: 'DbPassword in "App"',
    targetUrl: 'https://dev.azure.com/o/p/_library?x=1',
  },
  {
    area: 'Variable groups',
    severity: 'action',
    title: 'Fill secret value',
    detail: 'DbPassword in "App"',
    targetUrl: 'https://dev.azure.com/o/p/_library?x=1',
  },
  { area: 'Repos', severity: 'info', title: 'PRs', detail: 'not copied' },
  { area: 'Pipelines', severity: 'warning', title: '=HYPERLINK("x")', detail: '+cmd' },
];

describe('migration report', () => {
  it('deduplicates and groups', () => {
    expect(dedupeReport(items)).toHaveLength(3);
    const g = groupBySeverity(items);
    expect([g.action.length, g.warning.length, g.info.length]).toEqual([1, 1, 1]);
  });

  it('Markdown is a checklist with links', () => {
    const md = reportToMarkdown(
      {
        title: 'Repos',
        source: 'a / P1',
        target: 'b / P2',
        finishedAt: new Date(0),
        counts: { ok: 2, skipped: 0, warning: 1, failed: 1 },
        failures: [{ label: 'web', message: 'boom' }],
      },
      items,
    );
    expect(md).toContain('## To do (1)');
    expect(md).toContain('- [ ] **Fill secret value**');
    expect(md).toContain('([open](https://dev.azure.com/o/p/_library?x=1))');
    expect(md).toContain('## Failed (1)');
  });

  it("CSV can't run formulas when opened in a spreadsheet", () => {
    const csv = reportToCsv(items);
    expect(csv.split('\n')[0]).toBe('Status,Area,Item,Detail,Target link,Source link');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("'+cmd");
  });

  it('links point at the right Azure DevOps pages', () => {
    expect(adoLinks.variableGroup('my org', 'Proj A', 12)).toBe(
      'https://dev.azure.com/my%20org/Proj%20A/_library?itemType=VariableGroups&view=VariableGroupView&variableGroupId=12',
    );
    expect(adoLinks.workItem('o', 'P', 5)).toBe('https://dev.azure.com/o/P/_workitems/edit/5');
    expect(marketplaceLink('ms-devlabs.custom-terraform-tasks.custom-terraform-release-task')).toBe(
      'https://marketplace.visualstudio.com/items?itemName=ms-devlabs.custom-terraform-tasks',
    );
  });
});

describe('lock countdown', () => {
  it('turns amber at ten minutes and red at five', () => {
    expect(lockLevel(null)).toBe('off');
    expect(lockLevel(LOCK_EXPIRY_MS)).toBe('ok');
    expect(lockLevel(10 * 60_000 + 1)).toBe('ok');
    expect(lockLevel(10 * 60_000)).toBe('soon');
    expect(lockLevel(5 * 60_000 + 1)).toBe('soon');
    expect(lockLevel(5 * 60_000)).toBe('urgent');
    expect(lockLevel(1)).toBe('urgent');
    expect(lockLevel(0)).toBe('expired');
  });

  it('repaints faster as it gets closer', () => {
    expect(tickInterval('ok')).toBe(60_000);
    expect(tickInterval('soon')).toBe(15_000);
    expect(tickInterval('urgent')).toBe(1_000);
    expect(tickInterval('expired')).toBeNull();
  });

  it('shows minutes, then m:ss, and reads out naturally', () => {
    expect(formatLockTime(24 * 60_000)).toBe('24m');
    expect(formatLockTime(4 * 60_000 + 7_000)).toBe('4:07');
    expect(speakLockTime(4 * 60_000 + 12_000)).toBe('4 minutes 12 seconds');
    expect(speakLockTime(61_000)).toBe('1 minute 1 second');
  });
});

describe('security headers', () => {
  const root = path.resolve(__dirname, '../..');
  const read = (f: string) => readFileSync(path.join(root, f), 'utf8');

  it('the CSP script hash matches the inline theme script, on every host', () => {
    const html = read('index.html').replace(/\r\n/g, '\n');
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
    const hash = `'sha256-${createHash('sha256').update(script).digest('base64')}'`;
    const vercel = JSON.parse(read('vercel.json')) as {
      headers: { headers: { key: string; value: string }[] }[];
    };
    const csp = vercel.headers[0]!.headers.find((h) => h.key === 'Content-Security-Policy')!.value;
    expect(csp).toContain(hash);
    expect(read('netlify.toml')).toContain(hash);
    expect(read('nginx.conf.example')).toContain(hash);
  });

  it('the page can only talk to its own origin', () => {
    const vercel = read('vercel.json');
    expect(vercel).toContain("connect-src 'self'");
    expect(vercel).toContain("frame-ancestors 'none'");
    expect(vercel).toContain("object-src 'none'");
    expect(vercel).not.toMatch(/unsafe-eval/);
  });
});
