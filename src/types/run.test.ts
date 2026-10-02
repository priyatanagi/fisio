import { describe, it, expect } from 'vitest';
import { isRetryableRun, TERMINAL_RUN_STATUSES, type RunRecord } from './run';

const record = (over: Partial<RunRecord> = {}): RunRecord => ({
  runId: 'r1',
  seedTopic: 'Program Makan Bergizi Gratis',
  status: 'failed',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('isRetryableRun', () => {
  it('offers a retry for a failed run with no article', () => {
    expect(isRetryableRun(record())).toBe(true);
    expect(isRetryableRun(record({ status: 'interrupted' }))).toBe(true);
  });

  it('does not retry a run that already produced an article', () => {
    expect(isRetryableRun(record({ articleId: 'a1' }))).toBe(false);
  });

  it('does not retry a run that is still going', () => {
    expect(isRetryableRun(record({ status: 'running' }))).toBe(false);
  });

  it('does not retry a finished run', () => {
    expect(isRetryableRun(record({ status: 'done' }))).toBe(false);
    expect(isRetryableRun(record({ status: 'needs_attention' }))).toBe(false);
  });
});

describe('TERMINAL_RUN_STATUSES', () => {
  it('covers every status that cannot change on its own', () => {
    expect(TERMINAL_RUN_STATUSES).toContain('done');
    expect(TERMINAL_RUN_STATUSES).toContain('failed');
    expect(TERMINAL_RUN_STATUSES).toContain('interrupted');
    expect(TERMINAL_RUN_STATUSES).toContain('needs_attention');
    expect(TERMINAL_RUN_STATUSES).not.toContain('running');
  });
});