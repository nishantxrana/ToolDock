import type * as ExcelJS from 'exceljs';

/** Characters Excel forbids in a sheet name. */
const INVALID_SHEET_CHARS = /[:\\/?*[\]]/g;

/**
 * The OOXML/xlsx spec caps sheet names at 31 chars. This isn't just an Excel
 * UI restriction - the writer itself throws if given a longer name, so this
 * can't be raised without switching libraries. The full, untruncated name is
 * never actually lost though: it's written into the sheet content itself (see
 * buildKeyValueSheet) and it's also what the downloaded filename is built from.
 */
export function safeSheetName(label: string): string {
  const cleaned = label.replace(INVALID_SHEET_CHARS, ' ').trim().slice(0, 31);
  return cleaned || 'Sheet1';
}

/**
 * Sheet name for one sheet of a multi-group export: a zero-padded ordinal
 * prefix (width matches the total sheet count) followed by as much of the
 * sanitized name as fits in 31 chars. The prefix alone guarantees uniqueness,
 * so no collision/dedupe logic is needed even if two group names are identical.
 */
export function indexedSheetName(index: number, total: number, label: string): string {
  const width = String(total).length;
  const prefix = `${String(index).padStart(width, '0')} - `;
  const maxNameLen = Math.max(31 - prefix.length, 1);
  const cleaned = label.replace(INVALID_SHEET_CHARS, ' ').trim().slice(0, maxNameLen);
  return `${prefix}${cleaned || 'Sheet'}`;
}

export interface XlsxRow {
  key: string;
  /** Ignored when isSecret is true. */
  value: string;
  /** Secret values can't be read from Azure DevOps; written as [secret], never as [empty]. */
  isSecret?: boolean;
}

const NAVY: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF0b5394' },
};

const THIN_BLACK: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };

const ALL_BORDERS: Partial<ExcelJS.Borders> = {
  top: THIN_BLACK,
  left: THIN_BLACK,
  bottom: THIN_BLACK,
  right: THIN_BLACK,
};

const GRAY_ITALIC: Partial<ExcelJS.Font> = { italic: true, color: { argb: 'FF999999' }, size: 10 };

/**
 * Placeholder for a value that can't be shown, in gray italic:
 *  [secret]  - the variable exists but is secret, so Azure DevOps won't return its value
 *  [empty]   - the variable exists and its value is an empty string
 *  [not set] - the variable doesn't exist in this group
 */
function setPlaceholder(cell: ExcelJS.Cell, label: '[secret]' | '[empty]' | '[not set]') {
  cell.value = label;
  cell.font = GRAY_ITALIC;
}

/** Apply the standard Key/Value sheet formatting to a worksheet. */
function formatKeyValueSheet(ws: ExcelJS.Worksheet, fullName: string, rows: XlsxRow[]) {
  // --- Title row (row 1) ---
  ws.mergeCells('A1:B1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `Variable Group Name = ${fullName}`;
  titleCell.fill = NAVY;
  titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
  titleCell.border = ALL_BORDERS;
  ws.getRow(1).height = 20;

  // --- Header row (row 2) ---
  const headerRow = ws.getRow(2);
  headerRow.height = 18;
  (['Key', 'Value'] as const).forEach((label, ci) => {
    const cell = ws.getCell(2, ci + 1);
    cell.value = label;
    cell.fill = NAVY;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    cell.border = ALL_BORDERS;
  });

  // --- Data rows (rows 3+) ---
  rows.forEach((r, i) => {
    const rowIdx = i + 3;
    const kCell = ws.getCell(rowIdx, 1);
    const vCell = ws.getCell(rowIdx, 2);
    kCell.value = r.key;
    if (r.isSecret) {
      setPlaceholder(vCell, '[secret]');
    } else if (r.value === '') {
      setPlaceholder(vCell, '[empty]');
    } else {
      vCell.value = r.value;
    }
    for (const cell of [kCell, vCell]) {
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      cell.border = ALL_BORDERS;
    }
  });

  // --- Column widths ---
  // Col A: widest key + 2 padding chars (min 10, max 60)
  const longestKey = rows.reduce((max, r) => Math.max(max, r.key.length), 3);
  ws.getColumn(1).width = Math.min(Math.max(longestKey + 2, 10), 60);
  // Col B: 770px ÷ 7 ≈ 110 chars
  ws.getColumn(2).width = 110;
}

/** Serialize the workbook to an ArrayBuffer and trigger download. */
async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Build a single-sheet Key/Value workbook and trigger its download. ExcelJS
 * is dynamically imported so it only loads when a user actually exports -
 * it doesn't bloat the main bundle.
 */
export async function exportKeyValueXlsx(
  filename: string,
  sheetName: string,
  rows: XlsxRow[],
  _options: { titleRow?: boolean } = {},
): Promise<void> {
  const mod = await import('exceljs');
  // The browser bundle (exceljs.min.js) is UMD - Workbook may be on .default
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Workbook } = ((mod as any).default ?? mod) as typeof import('exceljs');
  const workbook = new Workbook();
  const ws = workbook.addWorksheet(safeSheetName(sheetName));
  formatKeyValueSheet(ws, sheetName, rows);
  await downloadWorkbook(workbook, filename);
}

export interface ReleaseMappingRow {
  groupName: string;
  pipelineName: string;
  stageName: string;
  scope: string;
}

const RELEASE_HEADERS = ['Variable Group', 'Pipeline Name', 'Stage', 'Scope'] as const;

/** Build and download a single-sheet release pipeline mapping workbook. */
export async function exportReleaseMappingXlsx(
  filename: string,
  title: string,
  rows: ReleaseMappingRow[],
): Promise<void> {
  const mod = await import('exceljs');
  // The browser bundle (exceljs.min.js) is UMD - Workbook may be on .default
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Workbook } = ((mod as any).default ?? mod) as typeof import('exceljs');
  const workbook = new Workbook();
  const ws = workbook.addWorksheet('Pipeline Mapping');

  // Title row - merge across 4 columns
  ws.mergeCells('A1:D1');
  const titleCell = ws.getCell('A1');
  titleCell.value = title;
  titleCell.fill = NAVY;
  titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = ALL_BORDERS;
  ws.getRow(1).height = 20;

  // Header row
  RELEASE_HEADERS.forEach((label, ci) => {
    const cell = ws.getCell(2, ci + 1);
    cell.value = label;
    cell.fill = NAVY;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = ALL_BORDERS;
  });
  ws.getRow(2).height = 18;

  // Data rows
  rows.forEach((r, i) => {
    const rowIdx = i + 3;
    const values = [r.groupName, r.pipelineName, r.stageName, r.scope];
    values.forEach((val, ci) => {
      const cell = ws.getCell(rowIdx, ci + 1);
      cell.value = val;
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      cell.border = ALL_BORDERS;
    });
  });

  // Auto-width for all 4 columns
  const colKeys: (keyof ReleaseMappingRow)[] = ['groupName', 'pipelineName', 'stageName', 'scope'];
  colKeys.forEach((key, ci) => {
    const longest = rows.reduce(
      (max, r) => Math.max(max, r[key].length),
      RELEASE_HEADERS[ci]?.length ?? 10,
    );
    ws.getColumn(ci + 1).width = Math.min(longest + 2, 60);
  });

  await downloadWorkbook(workbook, filename);
}

export interface XlsxSheetInput {
  name: string;
  rows: XlsxRow[];
}

/**
 * Build a multi-sheet workbook, one sheet per variable group, and trigger its
 * download. Sheet tabs get an ordinal prefix so multiple groups never collide
 * once truncated to Excel's 31-char limit.
 */
export async function exportVariableGroupWorkbook(
  filename: string,
  sheets: XlsxSheetInput[],
): Promise<void> {
  const mod = await import('exceljs');
  // The browser bundle (exceljs.min.js) is UMD - Workbook may be on .default
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Workbook } = ((mod as any).default ?? mod) as typeof import('exceljs');
  const workbook = new Workbook();

  sheets.forEach((s, i) => {
    const tabName = indexedSheetName(i + 1, sheets.length, s.name);
    const ws = workbook.addWorksheet(tabName);
    formatKeyValueSheet(ws, s.name, s.rows);
  });

  await downloadWorkbook(workbook, filename);
}

// ---------------------------------------------------------------------------
// Variable Group Diff export
// ---------------------------------------------------------------------------

import type { DiffRow, DiffStatus } from './groupDiff';

const DIFF_STATUS_LABELS: Record<DiffStatus, string> = {
  identical: 'Identical',
  changed: 'Changed',
  'left-only': 'Left only',
  'right-only': 'Right only',
  'both-secret': 'Both secret',
};

/** ARGB fill colours per diff status (subtle, print-friendly). */
const DIFF_FILL: Record<DiffStatus, string | null> = {
  identical: null,
  changed: 'FFFFF3CD',
  'left-only': 'FFCCE5FF',
  'right-only': 'FFE8CCFF',
  'both-secret': 'FFF2F2F2',
};

function applyDiffCellBase(cell: ExcelJS.Cell, fill: string | null) {
  if (fill) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  }
  cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  cell.border = ALL_BORDERS;
}

export async function exportDiffXlsx(
  filename: string,
  leftName: string,
  rightName: string,
  rows: DiffRow[],
): Promise<void> {
  const mod = await import('exceljs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Workbook } = ((mod as any).default ?? mod) as typeof import('exceljs');
  const workbook = new Workbook();
  const ws = workbook.addWorksheet('Diff');

  // Title row (merge A1:D1)
  ws.mergeCells('A1:D1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `Variable Group Diff - ${leftName}  vs  ${rightName}`;
  titleCell.fill = NAVY;
  titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = ALL_BORDERS;
  ws.getRow(1).height = 22;

  // Header row
  const headers = ['Key', leftName, rightName, 'Status'];
  headers.forEach((label, ci) => {
    const cell = ws.getCell(2, ci + 1);
    cell.value = label;
    cell.fill = NAVY;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = ALL_BORDERS;
  });
  ws.getRow(2).height = 18;

  // Data rows
  rows.forEach((r, i) => {
    const rowIdx = i + 3;
    const fill = DIFF_FILL[r.status];

    const keyCell = ws.getCell(rowIdx, 1);
    keyCell.value = r.key;
    keyCell.font = { name: 'Consolas', size: 10 };
    applyDiffCellBase(keyCell, fill);

    const leftCell = ws.getCell(rowIdx, 2);
    if (r.status === 'right-only') setPlaceholder(leftCell, '[not set]');
    else if (r.leftSecret) setPlaceholder(leftCell, '[secret]');
    else if (!r.leftValue) setPlaceholder(leftCell, '[empty]');
    else leftCell.value = r.leftValue;
    applyDiffCellBase(leftCell, fill);

    const rightCell = ws.getCell(rowIdx, 3);
    if (r.status === 'left-only') setPlaceholder(rightCell, '[not set]');
    else if (r.rightSecret) setPlaceholder(rightCell, '[secret]');
    else if (!r.rightValue) setPlaceholder(rightCell, '[empty]');
    else rightCell.value = r.rightValue;
    applyDiffCellBase(rightCell, fill);

    const statusCell = ws.getCell(rowIdx, 4);
    statusCell.value = DIFF_STATUS_LABELS[r.status];
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyDiffCellBase(statusCell, fill);
  });

  // Column widths
  const longestKey = rows.reduce((m, r) => Math.max(m, r.key.length), 3);
  ws.getColumn(1).width = Math.min(longestKey + 2, 50);
  ws.getColumn(2).width = 60;
  ws.getColumn(3).width = 60;
  ws.getColumn(4).width = 14;

  await downloadWorkbook(workbook, filename);
}

// ---------------------------------------------------------------------------
// Multi-Group Compare export
// ---------------------------------------------------------------------------

import type { CompareRow } from './groupCompare';

export async function exportMultiGroupXlsx(
  filename: string,
  groupNames: string[],
  rows: CompareRow[],
): Promise<void> {
  const mod = await import('exceljs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Workbook } = ((mod as any).default ?? mod) as typeof import('exceljs');
  const workbook = new Workbook();
  const ws = workbook.addWorksheet('Compare');

  const totalCols = groupNames.length + 1; // Key + one per group

  // Title row
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `Variable Group Compare - ${groupNames.join('  ·  ')}`;
  titleCell.fill = NAVY;
  titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = ALL_BORDERS;
  ws.getRow(1).height = 22;

  // Header row
  const headers = ['Key', ...groupNames];
  headers.forEach((label, ci) => {
    const cell = ws.getCell(2, ci + 1);
    cell.value = label;
    cell.fill = NAVY;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = ALL_BORDERS;
  });
  ws.getRow(2).height = 18;

  // Fill per row status
  const ROW_FILL: Record<string, string | null> = {
    same: null,
    conflict: 'FFFFF3CD',
    partial: 'FFCCE5FF',
  };

  // Data rows
  rows.forEach((row, i) => {
    const rowIdx = i + 3;
    const fill = ROW_FILL[row.rowStatus] ?? null;

    const keyCell = ws.getCell(rowIdx, 1);
    keyCell.value = row.key;
    keyCell.font = { name: 'Consolas', size: 10 };
    if (fill) keyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    keyCell.alignment = { horizontal: 'left', vertical: 'middle' };
    keyCell.border = ALL_BORDERS;

    row.cells.forEach((cell, ci) => {
      const xlCell = ws.getCell(rowIdx, ci + 2);
      if (cell.status === 'missing') {
        setPlaceholder(xlCell, '[not set]');
      } else if (cell.status === 'secret') {
        setPlaceholder(xlCell, '[secret]');
      } else if (!cell.value) {
        setPlaceholder(xlCell, '[empty]');
      } else {
        xlCell.value = cell.value;
        xlCell.font = { size: 10 };
      }
      if (fill) xlCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      xlCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      xlCell.border = ALL_BORDERS;
    });
  });

  // Column widths
  const longestKey = rows.reduce((m, r) => Math.max(m, r.key.length), 3);
  ws.getColumn(1).width = Math.min(longestKey + 2, 50);
  groupNames.forEach((_, ci) => {
    ws.getColumn(ci + 2).width = 45;
  });

  await downloadWorkbook(workbook, filename);
}

// ---------------------------------------------------------------------------
// Migration report
// ---------------------------------------------------------------------------

export interface MigrationReportSheetRow {
  area: string;
  title: string;
  detail: string;
  targetUrl?: string;
  sourceUrl?: string;
}

export interface MigrationReportInput {
  title: string;
  summary: [string, string][];
  sheets: {
    name: string;
    tone: 'action' | 'warning' | 'info' | 'failed';
    rows: MigrationReportSheetRow[];
  }[];
}

const REPORT_TONE: Record<MigrationReportInput['sheets'][number]['tone'], string> = {
  action: 'FFFFF2CC',
  warning: 'FFFCE4D6',
  info: 'FFF2F2F2',
  failed: 'FFF4CCCC',
};

/** Migration report: a Summary sheet, then one sheet per severity with clickable links. */
export async function exportMigrationReportXlsx(
  filename: string,
  input: MigrationReportInput,
): Promise<void> {
  const mod = await import('exceljs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Workbook } = ((mod as any).default ?? mod) as typeof import('exceljs');
  const workbook = new Workbook();

  const summary = workbook.addWorksheet('Summary');
  summary.mergeCells('A1:B1');
  const title = summary.getCell('A1');
  title.value = input.title;
  title.fill = NAVY;
  title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  title.border = ALL_BORDERS;
  summary.getRow(1).height = 22;
  input.summary.forEach(([k, v], i) => {
    const row = summary.getRow(i + 2);
    row.getCell(1).value = k;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = v;
    row.getCell(1).border = ALL_BORDERS;
    row.getCell(2).border = ALL_BORDERS;
  });
  summary.getColumn(1).width = 22;
  summary.getColumn(2).width = 80;

  for (const sheet of input.sheets) {
    if (sheet.rows.length === 0) continue;
    const ws = workbook.addWorksheet(safeSheetName(sheet.name));
    const headers = ['Area', 'Item', 'Detail', 'Open in target', 'Source'];
    const head = ws.getRow(1);
    headers.forEach((h, i) => {
      const cell = head.getCell(i + 1);
      cell.value = h;
      cell.fill = NAVY;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.border = ALL_BORDERS;
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.rows.forEach((r, i) => {
      const row = ws.getRow(i + 2);
      row.getCell(1).value = r.area;
      row.getCell(2).value = r.title;
      row.getCell(3).value = r.detail;
      if (r.targetUrl) row.getCell(4).value = { text: 'Open', hyperlink: r.targetUrl };
      if (r.sourceUrl) row.getCell(5).value = { text: 'Source', hyperlink: r.sourceUrl };
      for (let c = 1; c <= 5; c++) {
        const cell = row.getCell(c);
        cell.border = ALL_BORDERS;
        cell.alignment = { vertical: 'top', wrapText: c === 3 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: REPORT_TONE[sheet.tone] },
        };
      }
      for (const c of [4, 5]) {
        if (row.getCell(c).value)
          row.getCell(c).font = { color: { argb: 'FF0563C1' }, underline: true };
      }
    });
    ws.getColumn(1).width = 16;
    ws.getColumn(2).width = 36;
    ws.getColumn(3).width = 80;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 12;
  }
  await downloadWorkbook(workbook, filename);
}
