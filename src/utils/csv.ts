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

export interface ColumnGuideValue {
  value: string;
  hint: string;
}

/**
 * The user-facing explanation of each CSV column, kept beside the schema it
 * describes so the guide on the batch page can never drift from what the
 * parser and validator actually accept.
 */
export interface ColumnGuideEntry {
  column: (typeof CSV_COLUMNS)[number];
  required: boolean;
  description: string;
  /** Present only for constrained columns; free-text columns omit it. */
  values?: ColumnGuideValue[];
  example: string;
}

export const COLUMN_GUIDE: ColumnGuideEntry[] = [
  {
    column: 'Topic_Idea',
    required: true,
    description:
      'The subject of the article. The only required column — a row with a blank topic fails validation.',
    example: 'Commercial treadmill buying guide for gym owners',
  },
  {
    column: 'Focus_Keyphrase',
    required: false,
    description:
      'Primary SEO keyphrase to optimise this article for. Leave blank to let the pipeline derive one from the topic.',
    example: 'commercial treadmill',
  },
  {
    column: 'Target_Length',
    required: false,
    description:
      'Word-count target for this row. Leave blank to use the standard length. An unknown value falls back to standard with a warning in Issues.',
    values: [
      { value: 'short', hint: 'About 600 words — fast, high-impact overview.' },
      { value: 'standard', hint: 'About 950 words — the default target.' },
      { value: 'long', hint: 'About 1500 words — deep, comprehensive coverage.' },
      { value: 'custom', hint: 'Uses the pipeline’s configured custom word count.' },
    ],
    example: 'long',
  },
  {
    column: 'Tone_Override',
    required: false,
    description:
      'Free-text writing-tone hint for this row only, overriding the profile tone. Leave blank to inherit the profile tone.',
    example: 'casual',
  },
  {
    column: 'Impower_Level',
    required: false,
    description:
      'SEO research depth for this row. Leave blank to inherit the batch default. An unknown value falls back to the default with a warning in Issues.',
    values: [
      { value: 'off', hint: 'Creator plans itself. 0 extra calls.' },
      { value: 'lite', hint: 'Metadata + 5 keywords. 1 call.' },
      { value: 'standard', hint: 'Full brief with outline. 1 call.' },
      { value: 'max', hint: 'Keyword research then brief. 2 calls.' },
    ],
    example: 'max',
  },
  {
    column: 'Reviewer_Mode',
    required: false,
    description:
      'Quality-gate strictness for this row. Leave blank to inherit the batch default. An unknown value falls back to the default with a warning in Issues.',
    values: [
      { value: 'off', hint: 'No review. 0 calls.' },
      { value: 'advisory', hint: 'Reports but never blocks. 1 call.' },
      { value: 'strict', hint: 'Blocks with one auto-revision. 1-2 calls.' },
    ],
    example: 'strict',
  },
];

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

/** Quotes a cell only when it would otherwise break the grid. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The downloadable starting point for a batch. The example rows are ordinary
 * rows — they name real topics and only use values `validateRow` accepts — so
 * uploading the file untouched queues three genuine articles instead of
 * tripping a warning the user has to clear first.
 */
export function batchTemplateCsv(): string {
  const examples: CsvRow[] = [
    {
      Topic_Idea: 'Commercial treadmill buying guide for gym owners',
      Focus_Keyphrase: 'commercial treadmill',
      Target_Length: '',
      Tone_Override: '',
      Impower_Level: '',
      Reviewer_Mode: '',
    },
    {
      Topic_Idea: 'How often to replace commercial gym equipment',
      Focus_Keyphrase: 'gym equipment lifespan',
      Target_Length: 'long',
      Tone_Override: 'casual',
      Impower_Level: '',
      Reviewer_Mode: '',
    },
    {
      Topic_Idea: 'Selectorized vs plate-loaded machines',
      Focus_Keyphrase: 'selectorized vs plate loaded',
      Target_Length: '',
      Tone_Override: '',
      Impower_Level: 'max',
      Reviewer_Mode: 'strict',
    },
  ];

  return [
    CSV_COLUMNS.join(','),
    ...examples.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(',')),
  ].join('\n');
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
