import { useCallback, useEffect, useReducer, useRef } from 'react';
import { runArticle } from './runArticle';
import { putArticle, putJob } from '../db';
import type { UserProfile } from '../types/profile';
import type { UniversalRules } from '../config/universalRules';
import type { MultiAgentConfig } from '../types/provider';
import type {
  ImpowerLevel,
  LengthTarget,
  PipelineConfig,
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
  | { type: 'ROW_STAGE'; rowId: string; stage: RowStatus; message: string }
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

  // Loading or clearing a job has to work on an empty queue; everything else
  // describes rows inside a job that must exist.
  if (action.type === 'LOAD_JOB') return { job: action.job };
  if (action.type === 'CLEAR_JOB') return { job: null };
  if (!job) return state;

  switch (action.type) {
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

export interface UseBatchQueueOptions {
  profile: UserProfile;
  multiAgentConfig: MultiAgentConfig;
  universalRules: UniversalRules;
}

export interface UseBatchQueueResult {
  state: QueueState;
  loadJob: (job: BatchJob) => void;
  clearJob: () => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  retryRow: (rowId: string) => void;
  setConcurrency: (value: number) => void;
}

export function targetWordsFor(row: BatchRow, job: BatchJob): number {
  switch (row.targetLength) {
    case 'short':
      return 600;
    case 'long':
      return 1500;
    case 'custom':
      return job.customWordCount;
    default:
      return 950;
  }
}

export function lengthTargetFor(row: BatchRow): LengthTarget {
  switch (row.targetLength) {
    case 'short':
    case 'standard':
    case 'long':
    case 'custom':
      return row.targetLength;
    default:
      return 'standard';
  }
}

export function useBatchQueue(options: UseBatchQueueOptions): UseBatchQueueResult {
  const [state, dispatch] = useReducer(batchQueueReducer, initialQueueState);

  // jobRef is the single source of truth for the current job inside async
  // callbacks. Reading state.job directly inside a worker would capture a stale
  // closure and re-run the same row forever.
  const jobRef = useRef<BatchJob | null>(null);
  jobRef.current = state.job;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const abortRef = useRef<AbortController | null>(null);

  // Rows handed to a worker during the current start() session. jobRef only
  // refreshes on re-render, so without this two concurrent workers can pick the
  // same pending row.
  const claimedRef = useRef<Set<string>>(new Set());

  // Persist on every status transition so a reload restores the queue.
  useEffect(() => {
    if (state.job) {
      void putJob(state.job as unknown as { jobId: string; createdAt: string; updatedAt: string });
    }
  }, [state.job]);

  // A reload or view unmount must not leave rows stranded mid-flight.
  useEffect(() => {
    const onUnload = () => dispatch({ type: 'RESET_IN_FLIGHT' });
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      dispatch({ type: 'RESET_IN_FLIGHT' });
    };
  }, []);

  const processRow = useCallback(async (rowId: string, signal: AbortSignal) => {
    const job = jobRef.current;
    if (!job) return;
    const row = job.rows.find((r) => r.rowId === rowId);
    if (!row) return;

    const config = {
      ...job.globalConfig,
      impower: row.impowerOverride || job.globalConfig.impower,
      reviewer: row.reviewerOverride || job.globalConfig.reviewer,
      targetWords: targetWordsFor(row, job),
      lengthTarget: lengthTargetFor(row),
    };

    try {
      const result = await runArticle({
        seedTopic: row.seedTopic,
        focusKeyphrase: row.focusKeyphrase || undefined,
        toneOverride: row.toneOverride,
        config,
        profile: optionsRef.current.profile,
        multiAgentConfig: optionsRef.current.multiAgentConfig,
        universalRules: optionsRef.current.universalRules,
        batchRefs: { jobId: job.jobId, rowId: row.rowId },
        runId: job.jobId,
        eventLabel: row.rowId,
        onStage: (stage, message) =>
          dispatch({ type: 'ROW_STAGE', rowId: row.rowId, stage, message }),
        signal,
      });

      if (result.error === 'aborted') {
        dispatch({ type: 'ROW_ABORTED', rowId: row.rowId });
        return;
      }

      if (result.status === 'done' && result.article) {
        await putArticle(result.article);
        dispatch({
          type: 'ROW_DONE',
          rowId: row.rowId,
          articleId: result.article.id,
          reviewReport: result.reviewReport ?? null,
        });
        return;
      }

      if (result.status === 'needs_attention') {
        if (result.article) await putArticle(result.article);
        dispatch({
          type: 'ROW_ATTENTION',
          rowId: row.rowId,
          articleId: result.article?.id ?? null,
          reviewReport: result.reviewReport!,
        });
        return;
      }

      dispatch({
        type: 'ROW_FAILED',
        rowId: row.rowId,
        error: result.error ?? 'Generation failed',
      });
    } catch (err) {
      if (signal.aborted) {
        dispatch({ type: 'ROW_ABORTED', rowId: row.rowId });
      } else {
        dispatch({
          type: 'ROW_FAILED',
          rowId: row.rowId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }, []);

  const start = useCallback(() => {
    const job = jobRef.current;
    if (!job) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const claimed = new Set<string>();
    claimedRef.current = claimed;

    const worker = async () => {
      for (;;) {
        if (signal.aborted) return;

        const current = jobRef.current;
        if (!current || current.isPaused) return;

        const next = current.rows.find((r) => r.status === 'pending' && !claimed.has(r.rowId));
        if (!next) return;
        claimed.add(next.rowId);

        dispatch({ type: 'ROW_STAGE', rowId: next.rowId, stage: 'running', message: 'starting...' });
        await processRow(next.rowId, signal);
      }
    };

    void Promise.all(Array.from({ length: job.concurrency }, worker));
  }, [processRow]);

  const pause = useCallback(() => dispatch({ type: 'SET_PAUSED', paused: true }), []);
  const resume = useCallback(() => dispatch({ type: 'SET_PAUSED', paused: false }), []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'RESET_IN_FLIGHT' });
    dispatch({ type: 'SET_PAUSED', paused: true });
  }, []);

  const retryRow = useCallback((rowId: string) => {
    // Free the claim so a worker still running can pick this row up.
    claimedRef.current.delete(rowId);
    dispatch({ type: 'RETRY_ROW', rowId });
  }, []);
  const setConcurrency = useCallback(
    (value: number) => dispatch({ type: 'SET_CONCURRENCY', concurrency: value }),
    []
  );
  const loadJob = useCallback((job: BatchJob) => {
    // Callers often do `loadJob(job)` then `start()` in the same tick, and
    // start() reads jobRef, so publish it before React re-renders.
    jobRef.current = job;
    dispatch({ type: 'LOAD_JOB', job });
  }, []);
  const clearJob = useCallback(() => dispatch({ type: 'CLEAR_JOB' }), []);

  return {
    state,
    loadJob,
    clearJob,
    start,
    pause,
    resume,
    cancel,
    retryRow,
    setConcurrency,
  };
}
