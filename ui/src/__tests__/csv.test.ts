import { describe, expect, it } from 'vitest';
import { parseKeyValueCsv, toKeyValueCsv, toKeyValueTxt } from '@/lib/utils/csv';

const rows = [
  { key: 'Domain', value: '', isSecret: false },
  { key: 'Password', value: '', isSecret: true },
  { key: 'User', value: 'svc, "reports"', isSecret: false },
];

describe('secret vs empty in text exports', () => {
  it('adds a Secret column only when there are secrets', () => {
    expect(toKeyValueCsv([{ key: 'A', value: '1' }])).toBe('Key,Value\nA,1');
    expect(toKeyValueCsv(rows)).toBe(
      'Key,Value,Secret\nDomain,,\nPassword,,yes\nUser,"svc, ""reports""",',
    );
  });

  it('comments secrets out in TXT', () => {
    expect(toKeyValueTxt(rows).split('\n')).toEqual([
      'Domain=',
      "# Password=  (secret: value can't be read from Azure DevOps)",
      'User=svc, "reports"',
    ]);
  });

  it('round-trips: re-importing skips secrets but keeps real empty values', () => {
    const parsed = parseKeyValueCsv(toKeyValueCsv(rows));
    expect(parsed.rows).toEqual([
      { key: 'Domain', value: '' },
      { key: 'User', value: 'svc, "reports"' },
    ]);
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain('Password');
  });

  it('still parses plain two-column CSVs', () => {
    expect(parseKeyValueCsv('Key,Value\nA,1\nB,').rows).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: '' },
    ]);
  });
});
