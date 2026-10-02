import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratedArticle, OutputFormatId } from '../types/article';
import type { UserProfile } from '../types/profile';
import type { MultiAgentConfig } from '../types/provider';
import type { UniversalRules } from '../config/universalRules';
import type { PipelineConfig } from '../pipeline/stages';
import type { RunRecord } from '../types/run';
import {
  runArticle,
  resumeArticle,
  type RunArticleOptions,
  type ResumeAction,
} from '../pipeline/runArticle';
import {
  deleteRun,
  listRuns,
  markInterruptedRuns,
  pruneRuns,
  putArticle,
  putRun,
} from '../db';
import { useAgentEvents } from '../pipeline/useAgentEvents';
import {
  appendStage,
  closeStages,
  expectedStages,
  groupAgentCalls,
  type StageTiming,
} from '../pipeline/agentActivity';

export interface UseArticleRunOptions {
  profile: UserProfile;
  multiAgentConfig: MultiAgentConfig;
  universalRules: UniversalRules;
  pipelineConfig: PipelineConfig;
  /** Persist + surface a finished article to the app shell. */
  onArticleSaved: (article: GeneratedArticle) => void;
}

export interface StartOverrides {
  seedTopic?: string;
  focusKeyphrase?: string;
  secondaryKeywords?: string;
}

/**
 * Owns the single-article run and the console inputs.
 *
 * This lives above the router switch on purpose. When it lived inside
 * GenerateView, every route change unmounted the component and destroyed the
 * topic, the keyword, and the in-flight run's UI state together.
 */
export function useArticleRun(options: UseArticleRunOptions) {
  const { profile, multiAgentConfig, universalRules, pipelineConfig, onArticleSaved } = options;

  const [topic, setTopic] = useState('');
  const [focusKeyphrase, setFocusKeyphrase] = useState('');
  const [secondaryKeywords, setSecondaryKeywords] = useState('');
  const [currentArticle, setCurrentArticle] = useState<GeneratedArticle | null>(null);
  const [activeFormat, setActiveFormat] = useState<OutputFormatId>('inline-en');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stageMessage, setStageMessage] = useState('');
  const [timings, setTimings] = useState<StageTiming[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [runs, setRuns] = useState<RunRecord[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const lastRunRef = useRef<{
    seedTopic: string;
    focusKeyphrase?: string;
    secondaryKeywords?: string;
  } | null>(null);
  /** The run currently on the books, so every stage can update one record. */
  const activeRunRef = useRef<RunRecord | null>(null);

  const events = useAgentEvents(runId, isGenerating);
  const calls = useMemo(() => groupAgentCalls(events), [events]);
  const stagePlan = useMemo(() => expectedStages(pipelineConfig), [pipelineConfig]);

  const refreshRuns = useCallback(async () => {
    try {
      setRuns(await listRuns());
    } catch (err) {
      console.warn('[run] could not read the run journal:', err);
    }
  }, []);

  // Anything still marked running belongs to a session that went away, so close
  // it out as interrupted before the journal is shown.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await markInterruptedRuns();
        await pruneRuns();
      } catch (err) {
        console.warn('[run] journal reconcile failed:', err);
      }
      if (!cancelled) await refreshRuns();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshRuns]);

  const journal = useCallback(async (patch: Partial<RunRecord>) => {
    const current = activeRunRef.current;
    if (!current) return;
    const next: RunRecord = { ...current, ...patch, updatedAt: new Date().toISOString() };
    activeRunRef.current = next;
    try {
      await putRun(next);
    } catch (err) {
      console.warn('[run] journal write failed:', err);
    }
  }, []);

  const finishRun = useCallback(() => {
    setIsGenerating(false);
    setStageMessage('');
    setTimings((previous) => closeStages(previous, Date.now()));
    abortRef.current = null;
  }, []);

  /** Opens a new run id and journals it before the first provider call. */
  const beginRun = (
    seedTopic: string,
    keyphrase: string | undefined,
    secondary: string | undefined
  ): RunArticleOptions => {
    const id = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunId(id);
    setTimings([]);
    setStageMessage('');

    const now = new Date().toISOString();
    activeRunRef.current = {
      runId: id,
      seedTopic,
      focusKeyphrase: keyphrase,
      secondaryKeywords: secondary,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    };
    void putRun(activeRunRef.current)
      .then(refreshRuns)
      .catch((err) => console.warn('[run] could not journal the new run:', err));

    return {
      seedTopic,
      focusKeyphrase: keyphrase,
      config: pipelineConfig,
      profile,
      multiAgentConfig,
      universalRules,
      runId: id,
      onStage: (stage, message) => {
        setStageMessage(message);
        setTimings((previous) => appendStage(previous, stage, message, Date.now()));
      },
      signal: controller.signal,
    };
  };

  const commitResult = async (result: Awaited<ReturnType<typeof runArticle>>) => {
    if (result.article) {
      await putArticle(result.article);
      onArticleSaved(result.article);
      setCurrentArticle(result.article);
      const first = result.article.targetFormats?.[0];
      if (first) setActiveFormat(first);
      await journal({
        status: result.status === 'needs_attention' ? 'needs_attention' : 'done',
        articleId: result.article.id,
        error: undefined,
      });
    }

    if (result.status === 'needs_attention') {
      setError(
        'The reviewer blocked this article. Read the report in the article panel, then retry the Creator or skip to the Designer.'
      );
      setGateOpen(true);
    } else if (result.status === 'failed') {
      const aborted = result.error === 'aborted';
      setError(aborted ? null : result.error ?? 'Generation failed.');
      setGateOpen(false);
      await journal({
        status: aborted ? 'interrupted' : 'failed',
        error: aborted ? 'Cancelled by user.' : result.error ?? 'Generation failed.',
      });
    } else {
      setError(null);
      setGateOpen(false);
    }
    await refreshRuns();
  };

  const start = async (overrides?: StartOverrides) => {
    const seedTopic = (overrides?.seedTopic ?? topic).trim();
    if (!seedTopic || isGenerating) return;
    const keyphrase = overrides?.focusKeyphrase ?? (focusKeyphrase || undefined);
    const secondary = overrides?.secondaryKeywords ?? (secondaryKeywords || undefined);

    setIsGenerating(true);
    setError(null);
    setGateOpen(false);
    lastRunRef.current = { seedTopic, focusKeyphrase: keyphrase, secondaryKeywords: secondary };

    const runOptions = beginRun(seedTopic, keyphrase, secondary);
    try {
      await commitResult(await runArticle(runOptions));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      await journal({ status: 'failed', error: message });
      await refreshRuns();
    } finally {
      finishRun();
    }
  };

  const resume = async (action: ResumeAction) => {
    if (!currentArticle || isGenerating) return;
    setIsGenerating(true);
    setError(null);

    const seedTopic = lastRunRef.current?.seedTopic ?? currentArticle.topic;
    const runOptions = beginRun(
      seedTopic,
      lastRunRef.current?.focusKeyphrase,
      lastRunRef.current?.secondaryKeywords
    );
    try {
      await commitResult(await resumeArticle(currentArticle, runOptions, action));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      await journal({ status: 'failed', error: message });
      await refreshRuns();
    } finally {
      finishRun();
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    // runArticle reports the abort as it unwinds; record it now so the button
    // and History agree immediately.
    void journal({ status: 'interrupted', error: 'Cancelled by user.' }).then(refreshRuns);
  };

  /** Re-runs a journalled failure from History with its original input. */
  const retryRun = (record: RunRecord) => {
    setTopic(record.seedTopic);
    setFocusKeyphrase(record.focusKeyphrase ?? '');
    setSecondaryKeywords(record.secondaryKeywords ?? '');
    return start({
      seedTopic: record.seedTopic,
      focusKeyphrase: record.focusKeyphrase ?? '',
      secondaryKeywords: record.secondaryKeywords ?? '',
    });
  };

  const forgetRun = async (runIdToForget: string) => {
    try {
      await deleteRun(runIdToForget);
      await refreshRuns();
    } catch (err) {
      console.warn('[run] could not delete the run record:', err);
    }
  };

  return {
    topic,
    setTopic,
    focusKeyphrase,
    setFocusKeyphrase,
    secondaryKeywords,
    setSecondaryKeywords,
    currentArticle,
    setCurrentArticle,
    activeFormat,
    setActiveFormat,
    isGenerating,
    runId,
    stageMessage,
    timings,
    error,
    setError,
    gateOpen,
    runs,
    events,
    calls,
    stagePlan,
    start,
    resume,
    cancel,
    retryRun,
    forgetRun,
  };
}

export type ArticleRun = ReturnType<typeof useArticleRun>;