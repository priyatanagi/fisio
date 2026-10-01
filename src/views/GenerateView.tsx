import React, { useState, useEffect, useRef } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  // True while the current article is halted in the strict review gate, so the
  // workspace can offer Retry Creator / Skip to Designer.
  const [gateOpen, setGateOpen] = useState(false);
  const lastRunRef = useRef<{
    seedTopic: string;
    focusKeyphrase?: string;
    toneOverride?: string;
  } | null>(null);

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

    const runOptions: RunArticleOptions = {
      seedTopic: topic,
      focusKeyphrase: focusKeyphrase || undefined,
      config: pipelineConfig,
      profile,
      multiAgentConfig,
      universalRules,
      onStage: (_stage, message) => setStageMessage(message),
      signal: new AbortController().signal,
    };
    lastRunRef.current = {
      seedTopic: runOptions.seedTopic,
      focusKeyphrase: runOptions.focusKeyphrase,
    };

    try {
      const result = await runArticle(runOptions);
      commitResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
      setStageMessage('');
    }
  };

  const buildResumeOptions = (): RunArticleOptions => ({
    seedTopic: lastRunRef.current?.seedTopic ?? topic,
    focusKeyphrase: lastRunRef.current?.focusKeyphrase,
    toneOverride: lastRunRef.current?.toneOverride,
    config: pipelineConfig,
    profile,
    multiAgentConfig,
    universalRules,
    onStage: (_stage, message) => setStageMessage(message),
    signal: new AbortController().signal,
  });

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
      setError(result.error ?? 'Generation failed.');
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
      const result = await resumeArticle(currentArticle, buildResumeOptions(), action);
      await commitResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
      setStageMessage('');
    }
  };

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
      />

      {isGenerating && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-3">
          <div className="w-10 h-10 border-2 border-zinc-400 border-t-zinc-100 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-zinc-400 font-mono">{stageMessage || 'Working...'}</p>
        </div>
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
