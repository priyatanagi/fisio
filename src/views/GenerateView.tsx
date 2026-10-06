import React, { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import type { GeneratedArticle, LengthTarget } from '../types/article';
import type { UserProfile } from '../types/profile';
import type { MultiAgentConfig } from '../types/provider';
import type { PipelineConfig } from '../pipeline/stages';
import type { ArticleRun } from '../app/useArticleRun';
import { targetWordsForLengthTarget } from '../config/defaultPrompts';
import { PipelineSettingsPanel } from '../components/PipelineSettingsPanel';
import { TopicConsole } from '../components/TopicConsole';
import { ArticleWorkspace } from '../components/ArticleWorkspace';
import { ActivityPanel } from '../components/ActivityPanel';
import { ProcessProviderSelector } from '../components/ProcessProviderSelector';

interface GenerateViewProps {
  profile: UserProfile;
  multiAgentConfig: MultiAgentConfig;
  onMultiAgentConfigChange: (config: MultiAgentConfig) => void;
  pipelineConfig: PipelineConfig;
  onPipelineChange: (config: PipelineConfig) => void;
  articles: GeneratedArticle[];
  onUpdateArticle: (article: GeneratedArticle) => void;
  run: ArticleRun;
}

/**
 * Pure view over the shared run state. The run itself is owned above the
 * router, so leaving this page no longer tears down a generation in progress.
 */
export const GenerateView: React.FC<GenerateViewProps> = ({
  profile,
  multiAgentConfig,
  onMultiAgentConfigChange,
  pipelineConfig,
  onPipelineChange,
  articles,
  onUpdateArticle,
  run,
}) => {
  const {
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
    calls,
    stagePlan,
    start,
    resume,
    cancel,
  } = run;

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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <ProcessProviderSelector config={multiAgentConfig} onChange={onMultiAgentConfigChange} />
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
        lengthTarget={pipelineConfig.lengthTarget ?? 'standard'}
        setLengthTarget={(lt: LengthTarget) =>
          onPipelineChange({
            ...pipelineConfig,
            lengthTarget: lt,
            targetWords: targetWordsForLengthTarget(lt, pipelineConfig.targetWords),
          })
        }
        customWordCount={pipelineConfig.targetWords}
        setCustomWordCount={(count) => onPipelineChange({ ...pipelineConfig, targetWords: count })}
        isGenerating={isGenerating}
        onGenerate={() => void start()}
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
          onCancel={isGenerating ? cancel : undefined}
        />
      )}

      {currentArticle && !isGenerating && (
        <ArticleWorkspace
          article={currentArticle}
          onUpdateArticle={onUpdateArticle}
          activeFormat={activeFormat}
          onSelectFormat={setActiveFormat}
          profile={profile}
          multiAgentConfig={multiAgentConfig}
          onRetryCreator={gateOpen ? () => void resume('retry_creator') : undefined}
          onSkipToDesigner={gateOpen ? () => void resume('skip_designer') : undefined}
        />
      )}
    </div>
  );
};
