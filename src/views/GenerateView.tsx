import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import type { GeneratedArticle } from '../types/article';
import type { UserProfile } from '../types/profile';
import type { MultiAgentConfig } from '../types/provider';
import type { UniversalRules } from '../config/universalRules';
import type { PipelineConfig } from '../pipeline/stages';
import { runArticle, resumeArticle, type RunArticleOptions } from '../pipeline/runArticle';
import { putArticle } from '../db';
import { PipelineSettingsPanel } from '../components/PipelineSettingsPanel';
import { TopicConsole } from '../components/TopicConsole';
import { ArticleWorkspace } from '../components/ArticleWorkspace';
import { ActivityPanel } from '../components/ActivityPanel';
import { useAgentEvents } from '../pipeline/useAgentEvents';
import {
  appendStage,
  closeStages,
  expectedStages,
  groupAgentCalls,
  type StageTiming,
} from '../pipeline/agentActivity';

interface GenerateViewProps {
  profile: UserProfile;
  multiAgentConfig: MultiAgentConfig;
  universalRules: UniversalRules;
  pipelineConfig: PipelineConfig;
  onPipelineChange: (config: PipelineConfig) => void;
  articles: GeneratedArticle[];
  onUpdateArticle: (article: GeneratedArticle) => void;
  error: string | null;
  serverStatus: 'connected' | 'checking' | 'error';
}

export const GenerateView: React.FC<GenerateViewProps> = ({
  profile,
  multiAgentConfig,
  universalRules,
  pipelineConfig,
  onPipelineChange,
  articles,
  onUpdateArticle,
}) => {
  const [topic, setTopic] = useState('');
  const [focusKeyphrase, setFocusKeyphrase] = useState('');
  const [secondaryKeywords, setSecondaryKeywords] = useState('');
  const [currentArticle, setCurrentArticle] = useState<GeneratedArticle | null>(null);
  const [activeFormat, setActiveFormat] = useState<'inline-en' | 'inline-id' | 'clean-en' | 'clean-id'>('inline-en');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stageMessage, setStageMessage] = useState('');
  const [timings, setTimings] = useState<StageTiming[]>([]);
  // One id per run, shared with the server so its background activity can be
  // polled back into the live panel.
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True while the current article is halted in the strict review gate, so the
  // workspace can offer Retry Creator / Skip to Designer.
  const [gateOpen, setGateOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastRunRef = useRef<{
    seedTopic: string;
    focusKeyphrase?: string;
    toneOverride?: string;
  } | null>(null);

  const events = useAgentEvents(runId, isGenerating);
  const calls = useMemo(() => groupAgentCalls(events), [events]);
  const stagePlan = useMemo(() => expectedStages(pipelineConfig), [pipelineConfig]);

  const baseRunOptions = (): RunArticleOptions => {
    const id = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunId(id);
    setTimings([]);
    setStageMessage('');
    return {
      seedTopic: lastRunRef.current?.seedTopic ?? topic,
      focusKeyphrase: lastRunRef.current?.focusKeyphrase,
      toneOverride: lastRunRef.current?.toneOverride,
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

  const finishRun = () => {
    setIsGenerating(false);
    setStageMessage('');
    setTimings((previous) => closeStages(previous, Date.now()));
    abortRef.current = null;
  };

  // History's "open" action hands off through sessionStorage.
  useEffect(() => {
    const id = sessionStorage.getItem('fisio:openArticleId');
    if (!id) return;
    sessionStorage.removeItem('fisio:openArticleId');
    const found = articles.find((a) => a.id === id);
    if (found) {
      setCurrentArticle(found);
      setTopic(found.topic);
      setFocusKeyphrase(found.focusKeyphrase ?? '');
    }
  }, [articles]);

  const handleGenerate = async () => {
    if (!topic.trim() || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    setGateOpen(false);
    lastRunRef.current = {
      seedTopic: topic.trim(),
      focusKeyphrase: focusKeyphrase || undefined,
    };

    const runOptions: RunArticleOptions = {
      ...baseRunOptions(),
      seedTopic: topic.trim(),
      focusKeyphrase: focusKeyphrase || undefined,
    };

    try {
      const result = await runArticle(runOptions);
      commitResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      finishRun();
    }
  };

  // Persist the (re)built article and drive the gate state from the result.
  const commitResult = async (result: Awaited<ReturnType<typeof runArticle>>) => {
    if (result.article) {
      await putArticle(result.article);
      onUpdateArticle(result.article);
      setCurrentArticle(result.article);
      const first = result.article.targetFormats?.[0];
      if (first) setActiveFormat(first);
    }
    if (result.status === 'needs_attention') {
      setError(
        'The reviewer blocked this article. Read the report in the article panel, then retry the Creator or skip to the Designer.'
      );
      setGateOpen(true);
    } else if (result.status === 'failed') {
      setError(result.error === 'aborted' ? null : result.error ?? 'Generation failed.');
      setGateOpen(false);
    } else {
      setError(null);
      setGateOpen(false);
    }
  };

  const runResume = async (action: 'retry_creator' | 'skip_designer') => {
    if (!currentArticle || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await resumeArticle(currentArticle, baseRunOptions(), action);
      await commitResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      finishRun();
    }
  };

  const cancelRun = () => abortRef.current?.abort();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PipelineSettingsPanel config={pipelineConfig} onChange={onPipelineChange} />

      {error && (
        <div className="bg-rose-950/80 border border-rose-800 rounded-xl p-4 flex items-start gap-2.5 text-rose-200 text-xs">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
            Dismiss
          </button>
        </div>
      )}

      <TopicConsole
        topic={topic}
        setTopic={setTopic}
        focusKeyphrase={focusKeyphrase}
        setFocusKeyphrase={setFocusKeyphrase}
        secondaryKeywords={secondaryKeywords}
        setSecondaryKeywords={setSecondaryKeywords}
        targetFormats={pipelineConfig.targetFormats}
        setTargetFormats={(formats) => onPipelineChange({ ...pipelineConfig, targetFormats: formats })}
        lengthTarget="standard"
        setLengthTarget={() => {}}
        customWordCount={pipelineConfig.targetWords}
        setCustomWordCount={(count) => onPipelineChange({ ...pipelineConfig, targetWords: count })}
        isGenerating={isGenerating}
        onGenerate={handleGenerate}
        statusLabel={
          isGenerating
            ? stageMessage || 'Working'
            : runId
              ? `${calls.length} provider call${calls.length === 1 ? '' : 's'} · last run`
              : undefined
        }
      />

      {runId && (
        <ActivityPanel
          expected={stagePlan}
          timings={timings}
          calls={calls}
          running={isGenerating}
          stageMessage={stageMessage}
          onCancel={isGenerating ? cancelRun : undefined}
        />
      )}

      {currentArticle && !isGenerating && (
        <ArticleWorkspace
          article={currentArticle}
          onUpdateArticle={onUpdateArticle}
          activeFormat={activeFormat}
          onSelectFormat={setActiveFormat}
          profile={profile}
          onRetryCreator={gateOpen ? () => runResume('retry_creator') : undefined}
          onSkipToDesigner={gateOpen ? () => runResume('skip_designer') : undefined}
        />
      )}
    </div>
  );
};
