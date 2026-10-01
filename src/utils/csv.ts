import type { ImpowerLevel, ReviewerMode } from '../pipeline/stages';

export interface CsvRow {
  Topic_Idea: string;
  Focus_Keyphrase: string;
  Target_Length: string;
  Tone_Override: string;
  Impower_Level: string;
  Reviewer_Mode: string;
}

export const CSV_COLUMNS = [
  'Topic_Idea',
  'Focus_Keyphrase',
  'Target_Length',
  'Tone_Override',
  'Impower_Level',
  'Reviewer_Mode',
] as const;

export const IMPOWER_LEVELS: ImpowerLevel[] = ['off', 'lite', 'standard', 'max'];
export const REVIEWER_MODES: ReviewerMode[] = ['off', 'advisory', 'strict'];
export const LENGTHS = ['short', 'standard', 'long', 'custom'];

// Splits CSV text into a rectangular string grid, honouring quoted fields with
// embedded delimiters, newlines, and doubled quotes.
function toGrid(raw: string): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const text = raw.replace(/^\uFEFF/, '');

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      grid.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  row.push(field);
  grid.push(row);

  return grid.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function normalise(cell: string): string {
  return cell.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function parseCsv(raw: string): CsvRow[] {
  const grid = toGrid(raw);
  if (grid.length === 0) return [];

  const canonicalByNormalised: Record<string, string> = {};
  for (const column of CSV_COLUMNS) {
    canonicalByNormalised[normalise(column)] = column;
  }

  // A first row is a header when any cell matches a canonical column name, so a
  // reordered header still imports by name; otherwise the canonical positional
  // order is used. Matching normalises both sides so casing never drops a column.
  const headerOrder = grid[0].map((cell) => canonicalByNormalised[normalise(cell)] ?? null);
  const hasHeader = headerOrder.some((column) => column !== null);

  const body = hasHeader ? grid.slice(1) : grid;
  const order = hasHeader ? headerOrder : [...CSV_COLUMNS];

  return body.map((cells) => {
    const row: Record<string, string> = {};
    order.forEach((column, index) => {
      if (column) row[column] = (cells[index] ?? '').trim();
    });
    // Guarantee every canonical key exists even for sparse rows.
    for (const column of CSV_COLUMNS) {
      if (!(column in row)) row[column] = '';
    }
    return row as unknown as CsvRow;
  });
}

export interface RowIssue {
  field: string;
  message: string;
  fatal: boolean;
}

export function validateRow(
  row: CsvRow,
  globals: { impower: ImpowerLevel; reviewer: ReviewerMode }
): { impower: ImpowerLevel; reviewer: ReviewerMode; targetLength: string; issues: RowIssue[] } {
  const issues: RowIssue[] = [];

  if (!row.Topic_Idea?.trim()) {
    issues.push({ field: 'Topic_Idea', message: 'Topic is required', fatal: true });
  }

  let impower = globals.impower;
  const requestedImpower = (row.Impower_Level ?? '').trim().toLowerCase();
  if (requestedImpower) {
    if ((IMPOWER_LEVELS as string[]).includes(requestedImpower)) {
      impower = requestedImpower as ImpowerLevel;
    } else {
      issues.push({
        field: 'Impower_Level',
        message: `Unknown value "${row.Impower_Level}", using ${globals.impower}`,
        fatal: false,
      });
    }
  }

  let reviewer = globals.reviewer;
  const requestedReviewer = (row.Reviewer_Mode ?? '').trim().toLowerCase();
  if (requestedReviewer) {
    if ((REVIEWER_MODES as string[]).includes(requestedReviewer)) {
      reviewer = requestedReviewer as ReviewerMode;
    } else {
      issues.push({
        field: 'Reviewer_Mode',
        message: `Unknown value "${row.Reviewer_Mode}", using ${globals.reviewer}`,
        fatal: false,
      });
    }
  }

  let targetLength = (row.Target_Length ?? '').trim().toLowerCase() || 'standard';
  if (!LENGTHS.includes(targetLength)) {
    issues.push({
      field: 'Target_Length',
      message: `Unknown value "${row.Target_Length}", using standard`,
      fatal: false,
    });
    targetLength = 'standard';
  }

  return { impower, reviewer, targetLength, issues };
}
