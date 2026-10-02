export type RunStatus =
  /** Provider calls are in flight. */
  | 'running'
  /** An article was produced and saved. */
  | 'done'
  /** A draft exists but the strict reviewer halted it. */
  | 'needs_attention'
  /** The run stopped on an error. */
  | 'failed'
  /** The run never finished: cancelled, or the page went away mid-run. */
  | 'interrupted';

/** Terminal statuses: nothing further will happen to this run on its own. */
export const TERMINAL_RUN_STATUSES: RunStatus[] = [
  'done',
  'needs_attention',
  'failed',
  'interrupted',
];

export interface RunRecord {
  runId: string;
  seedTopic: string;
  focusKeyphrase?: string;
  secondaryKeywords?: string;
  status: RunStatus;
  error?: string;
  /** Set once an article record exists for this run. */
  articleId?: string;
  createdAt: string;
  updatedAt: string;
}

/** A run the user can act on again from History. */
export function isRetryableRun(run: RunRecord): boolean {
  return (run.status === 'failed' || run.status === 'interrupted') && !run.articleId;
}