/** Minimal RFC-4180-ish CSV parsing/serialization for `Key,Value` files. */

export interface CsvRow {
  key: string;
  value: string;
  /** Export only: adds a Secret column so a secret is never mistaken for an empty value. */
  isSecret?: boolean;
}

export interface CsvParseResult {
  rows: CsvRow[];
  /** Non-fatal warnings (skipped blank lines, malformed rows). */
  warnings: string[];
}

/** Parse a full CSV record set, handling quoted fields and embedded newlines. */
function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    record.push(field);
    field = '';
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ',') {
      pushField();
      i++;
    } else if (ch === '\r') {
      i++; // handled by \n
    } else if (ch === '\n') {
      pushRecord();
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  // trailing field/record
  if (field.length > 0 || record.length > 0) {
    pushRecord();
  }
  return records;
}

/**
 * Parse a `Key,Value` CSV. A header row `Key,Value` (case-insensitive) is
 * detected and skipped. Later duplicate keys overwrite earlier ones.
 */
export function parseKeyValueCsv(text: string): CsvParseResult {
  const warnings: string[] = [];
  const records = parseRecords(text).filter((r) => r.some((c) => c.trim().length > 0));

  if (records.length === 0) {
    return { rows: [], warnings: ['The file is empty.'] };
  }

  let start = 0;
  let secretCol = -1;
  const first = records[0];
  if (
    first &&
    first[0]?.trim().toLowerCase() === 'key' &&
    (first[1]?.trim().toLowerCase() === 'value' || first.length === 1)
  ) {
    start = 1;
    secretCol = first.findIndex((c, i) => i > 1 && c.trim().toLowerCase() === 'secret');
  }

  const map = new Map<string, string>();
  for (let r = start; r < records.length; r++) {
    const rec = records[r]!;
    const key = (rec[0] ?? '').trim();
    const value = rec[1] ?? '';
    if (!key) {
      warnings.push(`Row ${r + 1}: missing key - skipped.`);
      continue;
    }
    // A secret exported by ToolDock has no value. Importing it would wipe the real secret.
    const flagged = secretCol > 0 && /^(yes|true|1)$/i.test((rec[secretCol] ?? '').trim());
    if (flagged && value === '') {
      warnings.push(
        `Row ${r + 1}: "${key}" is a secret with no value - skipped so the existing secret is kept.`,
      );
      continue;
    }
    if (map.has(key)) {
      warnings.push(`Row ${r + 1}: duplicate key "${key}" - last value wins.`);
    }
    map.set(key, value);
  }

  const rows: CsvRow[] = [...map.entries()].map(([key, value]) => ({ key, value }));
  return { rows, warnings };
}

/** Escape a single CSV field. */
function escapeField(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Serialize rows to a `Key,Value` CSV (with header). When any row is secret a
 * third `Secret` column is added (yes / blank) and secret values are left empty,
 * so a secret is never confused with an empty value. CSV Import skips such rows.
 */
export function toKeyValueCsv(rows: CsvRow[]): string {
  const withSecret = rows.some((r) => r.isSecret);
  const lines = [withSecret ? 'Key,Value,Secret' : 'Key,Value'];
  for (const { key, value, isSecret } of rows) {
    const v = isSecret ? '' : value;
    lines.push(
      withSecret
        ? `${escapeField(key)},${escapeField(v)},${isSecret ? 'yes' : ''}`
        : `${escapeField(key)},${escapeField(v)}`,
    );
  }
  return lines.join('\n');
}

/**
 * Serialize rows as KEY=value lines. A secret is written as a commented-out
 * line, so the file never hands an empty string to something that reads it as
 * the real value, and a reader can still see the key exists.
 */
export function toKeyValueTxt(rows: CsvRow[]): string {
  return rows
    .map(({ key, value, isSecret }) =>
      isSecret ? `# ${key}=  (secret: value can't be read from Azure DevOps)` : `${key}=${value}`,
    )
    .join('\n');
}
