import type {
  ImpowerLevel,
  PipelineConfig,
  PipelineStage,
  ReviewerMode,
  ReviewReport,
} from './stages';

export type RowStatus =
  | 'pending'
  | 'running'
  | 'judging'
  | 'impowering'
  | 'creating'
  | 'reviewing'
  | 'designing'
  | 'done'
  | 'failed'
  | 'needs_attention';

export interface BatchRow {
  rowId: string;
  index: number;
  seedTopic: string;
  focusKeyphrase: string;
  targetLength: string;
  toneOverride: string;
  impowerOverride: ImpowerLevel | '';
  reviewerOverride: ReviewerMode | '';
  status: RowStatus;
  stageMessage: string;
  error: string | null;
  reviewReport: ReviewReport | null;
  articleId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  validationWarning: string | null;
}

export interface BatchJob {
  jobId: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
  concurrency: number;
  isPaused: boolean;
  customWordCount: number;
  globalConfig: Omit<PipelineConfig, 'targetWords'>;
  rows: BatchRow[];
}

export interface QueueState {
  job: BatchJob | null;
}

export type QueueAction =
  | { type: 'LOAD_JOB'; job: BatchJob }
  | { type: 'CLEAR_JOB' }
  | { type: 'CLAIM_ROWS' }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'SET_CONCURRENCY'; concurrency: number }
  | { type: 'ROW_STAGE'; rowId: string; stage: PipelineStage; message: string }
  | { type: 'ROW_DONE'; rowId: string; articleId: string; reviewReport: ReviewReport | null }
  | { type: 'ROW_FAILED'; rowId: string; error: string }
  | { type: 'ROW_ABORTED'; rowId: string }
  | { type: 'ROW_ATTENTION'; rowId: string; articleId: string | null; reviewReport: ReviewReport }
  | { type: 'RETRY_ROW'; rowId: string }
  | { type: 'RESET_IN_FLIGHT' };

export const initialQueueState: QueueState = { job: null };

const IN_FLIGHT: RowStatus[] = [
  'running',
  'judging',
  'impowering',
  'creating',
  'reviewing',
  'designing',
];

function isInFlight(row: BatchRow): boolean {
  return IN_FLIGHT.includes(row.status);
}

function updateRow(job: BatchJob, rowId: string, patch: Partial<BatchRow>): BatchJob {
  return {
    ...job,
    updatedAt: new Date().toISOString(),
    rows: job.rows.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)),
  };
}

export function batchQueueReducer(state: QueueState, action: QueueAction): QueueState {
  const { job } = state;
  if (!job) return state;

  switch (action.type) {
    case 'LOAD_JOB':
      return { job: action.job };

    case 'CLEAR_JOB':
      return { job: null };

    case 'SET_PAUSED':
      return { job: { ...job, isPaused: action.paused, updatedAt: new Date().toISOString() } };

    case 'SET_CONCURRENCY':
      return {
        job: {
          ...job,
          concurrency: Math.max(1, Math.min(3, action.concurrency)),
          updatedAt: new Date().toISOString(),
        },
      };

    case 'CLAIM_ROWS': {
      if (job.isPaused) return state;

      let slots = job.concurrency - job.rows.filter(isInFlight).length;
      if (slots <= 0) return state;

      const now = new Date().toISOString();
      const rows = job.rows.map((row) => {
        if (slots > 0 && row.status === 'pending') {
          slots -= 1;
          return {
            ...row,
            status: 'running' as RowStatus,
            stageMessage: 'starting...',
            error: null,
            startedAt: now,
          };
        }
        return row;
      });

      return { job: { ...job, rows, updatedAt: new Date().toISOString() } };
    }

    case 'ROW_STAGE':
      return {
        job: updateRow(job, action.rowId, {
          status: action.stage as RowStatus,
          stageMessage: action.message,
        }),
      };

    case 'ROW_DONE':
      return {
        job: updateRow(job, action.rowId, {
          status: 'done',
          stageMessage: 'complete',
          articleId: action.articleId,
          reviewReport: action.reviewReport,
          error: null,
          completedAt: new Date().toISOString(),
        }),
      };

    case 'ROW_FAILED':
      return {
        job: updateRow(job, action.rowId, {
          status: 'failed',
          stageMessage: '',
          error: action.error,
          completedAt: new Date().toISOString(),
        }),
      };

    // An abort means the work was interrupted, not that it failed. Resetting to
    // pending is what prevents a cancelled or reloaded batch from filling with
    // spurious failures.
    case 'ROW_ABORTED':
      return {
        job: updateRow(job, action.rowId, {
          status: 'pending',
          stageMessage: '',
          error: null,
          startedAt: null,
        }),
      };

    case 'ROW_ATTENTION':
      return {
        job: updateRow(job, action.rowId, {
          status: 'needs_attention',
          stageMessage: 'reviewer blocked this article',
          articleId: action.articleId,
          reviewReport: action.reviewReport,
          completedAt: new Date().toISOString(),
        }),
      };

    case 'RETRY_ROW':
      return {
        job: updateRow(job, action.rowId, {
          status: 'pending',
          stageMessage: '',
          error: null,
          reviewReport: null,
          articleId: null,
          startedAt: null,
          completedAt: null,
        }),
      };

    case 'RESET_IN_FLIGHT':
      return {
        job: {
          ...job,
          updatedAt: new Date().toISOString(),
          rows: job.rows.map((row) =>
            isInFlight(row)
              ? { ...row, status: 'pending' as RowStatus, stageMessage: '', startedAt: null }
              : row
          ),
        },
      };

    default:
      return state;
  }
}
