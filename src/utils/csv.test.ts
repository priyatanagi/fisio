import { describe, it, expect } from 'vitest';
import { parseCsv, validateRow } from './csv';

const HEADER =
  'Topic_Idea,Focus_Keyphrase,Target_Length,Tone_Override,Impower_Level,Reviewer_Mode';

describe('parseCsv basics', () => {
  it('maps a simple table positionally and fills every canonical key', () => {
    const rows = parseCsv('Treadmill,kw');
    expect(rows).toHaveLength(1);
    expect(rows[0].Topic_Idea).toBe('Treadmill');
    expect(rows[0].Focus_Keyphrase).toBe('kw');
    // Sparse rows still expose every column so callers never see undefined.
    expect(rows[0].Impower_Level).toBe('');
    expect(rows[0].Reviewer_Mode).toBe('');
  });

  it('detects and strips a header row', () => {
    const rows = parseCsv(`${HEADER}\nTreadmill guide,kw,short,`);
    expect(rows).toHaveLength(1);
    expect(rows[0].Topic_Idea).toBe('Treadmill guide');
  });

  it('maps columns by name', () => {
    const rows = parseCsv(`${HEADER}\nTreadmill,kw,long,Casual,off,advisory`);
    expect(rows[0]).toMatchObject({
      Topic_Idea: 'Treadmill',
      Focus_Keyphrase: 'kw',
      Target_Length: 'long',
      Tone_Override: 'Casual',
      Impower_Level: 'off',
      Reviewer_Mode: 'advisory',
    });
  });

  it('tolerates a reordered header', () => {
    const rows = parseCsv(
      'Focus_Keyphrase,Topic_Idea\nkw,Treadmill guide'
    );
    expect(rows[0].Topic_Idea).toBe('Treadmill guide');
    expect(rows[0].Focus_Keyphrase).toBe('kw');
  });

  it('assigns positional columns when no header is present', () => {
    const rows = parseCsv('Treadmill,kw,short');
    expect(rows[0].Topic_Idea).toBe('Treadmill');
    expect(rows[0].Target_Length).toBe('short');
  });
});

describe('parseCsv edge cases', () => {
  it('keeps commas inside quoted fields', () => {
    const rows = parseCsv(`${HEADER}\n"Commercial treadmills, motors, and belts",kw`);
    expect(rows[0].Topic_Idea).toBe('Commercial treadmills, motors, and belts');
  });

  it('handles escaped quotes inside a quoted field', () => {
    const rows = parseCsv(`${HEADER}\n"He said ""treadmill"" loudly",kw`);
    expect(rows[0].Topic_Idea).toBe('He said "treadmill" loudly');
  });

  it('handles CRLF line endings', () => {
    const rows = parseCsv(`${HEADER}\r\nTreadmill,kw`);
    expect(rows[0].Topic_Idea).toBe('Treadmill');
  });

  it('strips a UTF-8 BOM', () => {
    const rows = parseCsv(`\uFEFF${HEADER}\nTreadmill,kw`);
    expect(rows[0].Topic_Idea).toBe('Treadmill');
  });

  it('ignores trailing blank lines', () => {
    expect(parseCsv(`${HEADER}\nTreadmill,kw\n\n\n`)).toHaveLength(1);
  });

  it('fills missing trailing columns with empty strings', () => {
    const rows = parseCsv(`${HEADER}\nTreadmill`);
    expect(rows[0].Target_Length).toBe('');
  });

  it('handles newlines inside a quoted field', () => {
    const rows = parseCsv(`${HEADER}\n"line one\nline two",kw`);
    expect(rows[0].Topic_Idea).toBe('line one\nline two');
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('validateRow', () => {
  const globals = { impower: 'standard' as const, reviewer: 'strict' as const };
  const base = {
    Topic_Idea: 'Topic',
    Focus_Keyphrase: '',
    Target_Length: '',
    Tone_Override: '',
    Impower_Level: '',
    Reviewer_Mode: '',
  };

  it('inherits globals when override columns are blank', () => {
    const result = validateRow(base, globals);
    expect(result.impower).toBe('standard');
    expect(result.reviewer).toBe('strict');
    expect(result.issues).toEqual([]);
  });

  it('honours a valid Impower override', () => {
    expect(validateRow({ ...base, Impower_Level: 'max' }, globals).impower).toBe('max');
  });

  it('falls back with a warning for an invalid Impower override', () => {
    const result = validateRow({ ...base, Impower_Level: 'ultra' }, globals);
    expect(result.impower).toBe('standard');
    expect(result.issues[0].fatal).toBe(false);
  });

  it('honours a valid Reviewer override', () => {
    expect(validateRow({ ...base, Reviewer_Mode: 'off' }, globals).reviewer).toBe('off');
  });

  it('defaults Target_Length to standard when blank', () => {
    expect(validateRow(base, globals).targetLength).toBe('standard');
  });

  it('flags a missing topic as fatal', () => {
    const result = validateRow({ ...base, Topic_Idea: '  ' }, globals);
    expect(result.issues.some((i) => i.fatal && i.field === 'Topic_Idea')).toBe(true);
  });
});
