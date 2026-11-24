/**
 * The migration report: everything a run couldn't do for the user, as a
 * checklist with a link to the exact page where each item gets finished.
 *
 *   action  - the user must do this (fill a secret, create a connection…)
 *   warning - copied, but with a caveat worth checking
 *   info    - not copied, by design (history, PRs, run history…)
 */

export type ReportArea = 'Variable groups' | 'Repos' | 'Pipelines' | 'Boards' | 'Jira' | 'General';
export type ReportSeverity = 'action' | 'warning' | 'info';

export interface ReportItem {
  area: ReportArea;
  severity: ReportSeverity;
  title: string;
  detail: string;
  targetUrl?: string;
  sourceUrl?: string;
}

export const SEVERITY_LABEL: Record<ReportSeverity, string> = {
  action: 'To do',
  warning: 'Check',
  info: 'Not copied',
};

const SEVERITY_ORDER: ReportSeverity[] = ['action', 'warning', 'info'];

/** Collapse exact duplicates (same severity, title and detail). */
export function dedupeReport(items: ReportItem[]): ReportItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = `${i.severity}|${i.area}|${i.title}|${i.detail}|${i.targetUrl ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function groupBySeverity(items: ReportItem[]): Record<ReportSeverity, ReportItem[]> {
  const out: Record<ReportSeverity, ReportItem[]> = { action: [], warning: [], info: [] };
  for (const item of dedupeReport(items)) out[item.severity].push(item);
  return out;
}

export interface ReportHeader {
  title: string;
  source: string;
  target: string;
  finishedAt: Date;
  counts: { ok: number; skipped: number; warning: number; failed: number };
  failures: { label: string; message: string }[];
}

const mdEscape = (s: string) => s.replace(/([\\`*_[\]|<>])/g, '\\$1').replace(/\r?\n/g, ' ');

/** Markdown checklist, for pasting into a wiki page or a ticket. */
export function reportToMarkdown(header: ReportHeader, items: ReportItem[]): string {
  const g = groupBySeverity(items);
  const lines: string[] = [
    `# ${mdEscape(header.title)}`,
    '',
    `- **Source:** ${mdEscape(header.source)}`,
    `- **Target:** ${mdEscape(header.target)}`,
    `- **Finished:** ${header.finishedAt.toLocaleString()}`,
    `- **Result:** ${header.counts.ok} copied, ${header.counts.warning} with warnings, ${header.counts.skipped} skipped, ${header.counts.failed} failed`,
    '',
  ];
  for (const sev of SEVERITY_ORDER) {
    if (g[sev].length === 0) continue;
    lines.push(`## ${SEVERITY_LABEL[sev]} (${g[sev].length})`, '');
    for (const item of g[sev]) {
      const box = sev === 'action' ? '- [ ] ' : '- ';
      const link = item.targetUrl ? ` ([open](${item.targetUrl}))` : '';
      lines.push(
        `${box}**${mdEscape(item.title)}** · ${mdEscape(item.area)}: ${mdEscape(item.detail)}${link}`,
      );
    }
    lines.push('');
  }
  if (header.failures.length > 0) {
    lines.push(`## Failed (${header.failures.length})`, '');
    for (const f of header.failures)
      lines.push(`- **${mdEscape(f.label)}**: ${mdEscape(f.message)}`);
    lines.push('');
  }
  return lines.join('\n');
}

function csvField(s: string): string {
  // Neutralise spreadsheet formulas, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Flat CSV: one row per report item. */
export function reportToCsv(items: ReportItem[]): string {
  const rows = [['Status', 'Area', 'Item', 'Detail', 'Target link', 'Source link']];
  const g = groupBySeverity(items);
  for (const sev of SEVERITY_ORDER) {
    for (const i of g[sev]) {
      rows.push([
        SEVERITY_LABEL[sev],
        i.area,
        i.title,
        i.detail,
        i.targetUrl ?? '',
        i.sourceUrl ?? '',
      ]);
    }
  }
  return rows.map((r) => r.map(csvField).join(',')).join('\n');
}
