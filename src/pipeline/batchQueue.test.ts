import { describe, it, expect } from 'vitest';
import {
  batchQueueReducer,
  initialQueueState,
  type QueueState,
  type BatchRow,
} from './useBatchQueue';

function makeRow(index: number, overrides: Partial<BatchRow> = {}): BatchRow {
  return {
    rowId: `r${index}`,
    index,
    seedTopic: `topic ${index}`,
    focusKeyphrase: '',
    targetLength: 'standard',
    toneOverride: '',
    impowerOverride: '',
    reviewerOverride: '',
    status: 'pending',
    stageMessage: '',
    error: null,
    reviewReport: null,
    articleId: null,
    startedAt: null,
    completedAt: null,
    validationWarning: null,
    ...overrides,
  };
}

function makeState(rowCount: number, overrides: Partial<QueueState['job']> = {}): QueueState {
  return {
    ...initialQueueState,
    job: {
      jobId: 'j1',
      fileName: 'batch.csv',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      concurrency: 2,
      isPaused: false,
      customWordCount: 1000,
      globalConfig: {
        judge: true,
        impower: 'standard',
        reviewer: 'strict',
        targetFormats: ['inline-en'],
        languages: ['en'],
      },
      rows: Array.from({ length: rowCount }, (_, i) => makeRow(i)),
      ...overrides,
    },
  };
}

// Deliberately verbose: `done` is already a common word in this codebase and a
// short helper name by it invites confusion during review.
const inFlightCount = (s: QueueState): number =>
  s.job!.rows.filter((r) =>
    ['running', 'judging', 'impowering', 'creating', 'reviewing', 'designing'].includes(r.status)
  ).length;

describe('CLAIM_ROWS honours concurrency', () => {
  it('claims exactly the concurrency limit', () => {
    expect(inFlightCount(batchQueueReducer(makeState(10), { type: 'CLAIM_ROWS' }))).toBe(2);
  });

  it('honours a limit of 1', () => {
    expect(
      inFlightCount(batchQueueReducer(makeState(5, { concurrency: 1 }), { type: 'CLAIM_ROWS' }))
    ).toBe(1);
  });

  it('never exceeds the limit across repeated claims', () => {
    let s = batchQueueReducer(makeState(10), { type: 'CLAIM_ROWS' });
    s = batchQueueReducer(s, { type: 'CLAIM_ROWS' });
    s = batchQueueReducer(s, { type: 'CLAIM_ROWS' });
    expect(inFlightCount(s)).toBe(2);
  });

  it('claims nothing when paused', () => {
    expect(
      inFlightCount(batchQueueReducer(makeState(5, { isPaused: true }), { type: 'CLAIM_ROWS' }))
    ).toBe(0);
  });

  it('claims nothing when every row is already claimed', () => {
    const claimed = batchQueueReducer(makeState(2), { type: 'CLAIM_ROWS' });
    expect(inFlightCount(batchQueueReducer(claimed, { type: 'CLAIM_ROWS' }))).toBe(2);
  });

  it('claims nothing when there are no rows', () => {
    expect(inFlightCount(batchQueueReducer(makeState(0), { type: 'CLAIM_ROWS' }))).toBe(0);
  });

  it('stamps startedAt on a newly claimed row', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    expect(claimed.job!.rows.find((r) => r.rowId === 'r0')?.startedAt).not.toBeNull();
  });
});

describe('SET_PAUSED does not disturb in-flight rows', () => {
  it('sets the flag', () => {
    const s = batchQueueReducer(makeState(4), { type: 'SET_PAUSED', paused: true });
    expect(s.job!.isPaused).toBe(true);
  });

  it('leaves running rows running', () => {
    const claimed = batchQueueReducer(makeState(4), { type: 'CLAIM_ROWS' });
    const paused = batchQueueReducer(claimed, { type: 'SET_PAUSED', paused: true });
    expect(inFlightCount(paused)).toBe(2);
  });

  it('claims nothing further while paused', () => {
    let s = batchQueueReducer(makeState(6), { type: 'CLAIM_ROWS' });
    s = batchQueueReducer(s, { type: 'SET_PAUSED', paused: true });
    s = batchQueueReducer(s, { type: 'CLAIM_ROWS' });
    expect(inFlightCount(s)).toBe(2);
  });

  it('resumes claiming after unpausing', () => {
    let s = batchQueueReducer(makeState(6), { type: 'CLAIM_ROWS' });
    s = batchQueueReducer(s, { type: 'SET_PAUSED', paused: true });
    s = batchQueueReducer(s, { type: 'SET_PAUSED', paused: false });
    s = batchQueueReducer(s, { type: 'CLAIM_ROWS' });
    expect(inFlightCount(s)).toBe(2);
  });
});

describe('ROW_STAGE', () => {
  it('records the stage and message', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, {
      type: 'ROW_STAGE',
      rowId: 'r0',
      stage: 'creating',
      message: 'writing markdown',
    });
    const row = next.job!.rows.find((r) => r.rowId === 'r0');
    expect(row?.status).toBe('creating');
    expect(row?.stageMessage).toBe('writing markdown');
  });

  it('does not disturb other rows', () => {
    const claimed = batchQueueReducer(makeState(2), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, {
      type: 'ROW_STAGE',
      rowId: 'r0',
      stage: 'creating',
      message: 'x',
    });
    expect(next.job!.rows.find((r) => r.rowId === 'r1')?.status).toBe('running');
  });

  it('ignores an unknown rowId', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, {
      type: 'ROW_STAGE',
      rowId: 'nope',
      stage: 'creating',
      message: 'x',
    });
    expect(next.job!.rows).toHaveLength(1);
  });
});

describe('ROW_DONE', () => {
  it('marks the row done and links the article', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, {
      type: 'ROW_DONE',
      rowId: 'r0',
      articleId: 'art_1',
      reviewReport: null,
    });
    const row = next.job!.rows.find((r) => r.rowId === 'r0');
    expect(row?.status).toBe('done');
    expect(row?.articleId).toBe('art_1');
    expect(row?.completedAt).not.toBeNull();
  });

  it('frees a slot so the next row can be claimed', () => {
    let s = batchQueueReducer(makeState(4), { type: 'CLAIM_ROWS' });
    s = batchQueueReducer(s, { type: 'ROW_DONE', rowId: 'r0', articleId: 'a', reviewReport: null });
    s = batchQueueReducer(s, { type: 'CLAIM_ROWS' });
    expect(inFlightCount(s)).toBe(2);
  });
});

describe('ROW_FAILED is only for genuine failures', () => {
  it('marks the row failed with an error message', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, {
      type: 'ROW_FAILED',
      rowId: 'r0',
      error: 'provider returned 500',
    });
    const row = next.job!.rows.find((r) => r.rowId === 'r0');
    expect(row?.status).toBe('failed');
    expect(row?.error).toContain('500');
  });
});

describe('ROW_ABORTED resets rather than fails', () => {
  it('returns the row to pending', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, { type: 'ROW_ABORTED', rowId: 'r0' });
    expect(next.job!.rows.find((r) => r.rowId === 'r0')?.status).toBe('pending');
  });

  it('clears the error and stage message', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const staged = batchQueueReducer(claimed, {
      type: 'ROW_STAGE',
      rowId: 'r0',
      stage: 'creating',
      message: 'writing',
    });
    const next = batchQueueReducer(staged, { type: 'ROW_ABORTED', rowId: 'r0' });
    const row = next.job!.rows.find((r) => r.rowId === 'r0');
    expect(row?.stageMessage).toBe('');
    expect(row?.error).toBeNull();
  });

  it('never leaves any row failed after aborting all in-flight rows', () => {
    const claimed = batchQueueReducer(makeState(3), { type: 'CLAIM_ROWS' });
    let next = claimed;
    for (const row of claimed.job!.rows.filter((r) => r.status === 'running')) {
      next = batchQueueReducer(next, { type: 'ROW_ABORTED', rowId: row.rowId });
    }
    expect(next.job!.rows.some((r) => r.status === 'failed')).toBe(false);
  });
});

describe('ROW_ATTENTION', () => {
  it('marks the row needs_attention and stores the report', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const report = {
      verdict: 'fail' as const,
      seoScore: 30,
      issues: [],
      revisedAfterIssues: true,
    };
    const next = batchQueueReducer(claimed, {
      type: 'ROW_ATTENTION',
      rowId: 'r0',
      articleId: 'art_1',
      reviewReport: report,
    });
    const row = next.job!.rows.find((r) => r.rowId === 'r0');
    expect(row?.status).toBe('needs_attention');
    expect(row?.reviewReport).toEqual(report);
  });
});

describe('RETRY_ROW', () => {
  it('resets a failed row to pending', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const failed = batchQueueReducer(claimed, {
      type: 'ROW_FAILED',
      rowId: 'r0',
      error: 'boom',
    });
    const next = batchQueueReducer(failed, { type: 'RETRY_ROW', rowId: 'r0' });
    const row = next.job!.rows.find((r) => r.rowId === 'r0');
    expect(row?.status).toBe('pending');
    expect(row?.error).toBeNull();
  });

  it('resets a needs_attention row to pending', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const halted = batchQueueReducer(claimed, {
      type: 'ROW_ATTENTION',
      rowId: 'r0',
      articleId: null,
      reviewReport: {
        verdict: 'fail',
        seoScore: 1,
        issues: [],
        revisedAfterIssues: true,
      },
    });
    const next = batchQueueReducer(halted, { type: 'RETRY_ROW', rowId: 'r0' });
    expect(next.job!.rows.find((r) => r.rowId === 'r0')?.status).toBe('pending');
  });

  it('makes the row claimable again', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const failed = batchQueueReducer(claimed, {
      type: 'ROW_FAILED',
      rowId: 'r0',
      error: 'boom',
    });
    const retried = batchQueueReducer(failed, { type: 'RETRY_ROW', rowId: 'r0' });
    expect(inFlightCount(batchQueueReducer(retried, { type: 'CLAIM_ROWS' }))).toBe(1);
  });
});

describe('RESET_IN_FLIGHT', () => {
  it('returns every running row to pending, as on page unload', () => {
    const claimed = batchQueueReducer(makeState(4), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, { type: 'RESET_IN_FLIGHT' });
    expect(inFlightCount(next)).toBe(0);
    expect(next.job!.rows.every((r) => r.status === 'pending')).toBe(true);
  });

  it('leaves completed rows untouched', () => {
    let s = batchQueueReducer(makeState(4), { type: 'CLAIM_ROWS' });
    s = batchQueueReducer(s, { type: 'ROW_DONE', rowId: 'r0', articleId: 'a', reviewReport: null });
    s = batchQueueReducer(s, { type: 'RESET_IN_FLIGHT' });
    expect(s.job!.rows.find((r) => r.rowId === 'r0')?.status).toBe('done');
  });
});

describe('job-level actions', () => {
  it('SET_CONCURRENCY changes the limit', () => {
    const s = batchQueueReducer(makeState(5), { type: 'SET_CONCURRENCY', concurrency: 3 });
    expect(inFlightCount(batchQueueReducer(s, { type: 'CLAIM_ROWS' }))).toBe(3);
  });

  it('SET_CONCURRENCY clamps to the 1-3 range', () => {
    expect(batchQueueReducer(makeState(1), { type: 'SET_CONCURRENCY', concurrency: 9 }).job!.concurrency).toBe(3);
    expect(batchQueueReducer(makeState(1), { type: 'SET_CONCURRENCY', concurrency: 0 }).job!.concurrency).toBe(1);
  });

  it('LOAD_JOB replaces the job', () => {
    const s = batchQueueReducer(makeState(1), {
      type: 'LOAD_JOB',
      job: makeState(7).job!,
    });
    expect(s.job!.rows).toHaveLength(7);
  });

  it('CLEAR_JOB empties the job', () => {
    expect(batchQueueReducer(makeState(3), { type: 'CLEAR_JOB' }).job).toBeNull();
  });
});

describe('null-job safety', () => {
  it('returns the same state for every action when there is no job', () => {
    const actions: Parameters<typeof batchQueueReducer>[1][] = [
      { type: 'CLAIM_ROWS' },
      { type: 'SET_PAUSED', paused: true },
      { type: 'RESET_IN_FLIGHT' },
      { type: 'RETRY_ROW', rowId: 'r0' },
    ];
    for (const action of actions) {
      expect(batchQueueReducer(initialQueueState, action)).toBe(initialQueueState);
    }
  });
});
