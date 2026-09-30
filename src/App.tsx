/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { TopicConsole } from './components/TopicConsole';
import { ArticleWorkspace } from './components/ArticleWorkspace';
import { RulesModal } from './components/RulesModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { HistoryDrawer } from './components/HistoryDrawer';
import { ProviderSettingsModal } from './components/ProviderSettingsModal';
import {
  LengthTarget,
  OutputFormatId,
  GeneratedArticle,
} from './types/article';
import {
  ProviderConfig,
  DEFAULT_PROVIDER_CONFIG,
} from './types/provider';
import {
  DEFAULT_BASE_SYSTEM_PROMPT,
  DEFAULT_NEGATIVE_PROMPT,
} from './config/defaultPrompts';
import {
  copyToClipboard,
  downloadAllAsZip,
} from './utils/exportUtils';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Zap,
  Globe2,
  Code2,
  Cpu,
  Layers,
  Gauge,
  CheckSquare,
} from 'lucide-react';

export default function App() {
  const [topic, setTopic] = useState('');
  const [focusKeyphrase, setFocusKeyphrase] = useState('');
  const [secondaryKeywords, setSecondaryKeywords] = useState('');
  const [targetFormats, setTargetFormats] = useState<OutputFormatId[]>([
    'inline-en',
    'inline-id',
    'clean-en',
    'clean-id',
  ]);
  const [lengthTarget, setLengthTarget] = useState<LengthTarget>('standard');
  const [customWordCount, setCustomWordCount] = useState<number>(1000);

  // Multi-Provider config state
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>(() => {
    try {
      const stored = localStorage.getItem('fitseo_provider_config');
      return stored ? JSON.parse(stored) : DEFAULT_PROVIDER_CONFIG;
    } catch {
      return DEFAULT_PROVIDER_CONFIG;
    }
  });

  const [systemPrompt, setSystemPrompt] = useState<string>(() => {
    return localStorage.getItem('fitseo_system_prompt') || DEFAULT_BASE_SYSTEM_PROMPT;
  });

  const [negativePrompt, setNegativePrompt] = useState<string>(() => {
    return localStorage.getItem('fitseo_negative_prompt') || DEFAULT_NEGATIVE_PROMPT;
  });

  const [currentArticle, setCurrentArticle] = useState<GeneratedArticle | null>(null);
  const [history, setHistory] = useState<GeneratedArticle[]>(() => {
    try {
      const stored = localStorage.getItem('fitseo_history');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'connected' | 'checking' | 'error'>('checking');

  const [activeFormat, setActiveFormat] = useState<OutputFormatId>('inline-en');

  // Modals
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [providerModalOpen, setProviderModalOpen] = useState(false);

  // Check health on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') {
          setServerStatus('connected');
        } else {
          setServerStatus('error');
        }
      })
      .catch(() => {
        setServerStatus('error');
      });
  }, []);

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('fitseo_history', JSON.stringify(history.slice(0, 15)));
    } catch (e) {
      console.warn('Unable to persist history', e);
    }
  }, [history]);

  const handleSaveProviderConfig = (newConfig: ProviderConfig) => {
    setProviderConfig(newConfig);
    try {
      localStorage.setItem('fitseo_provider_config', JSON.stringify(newConfig));
    } catch (e) {
      console.warn('Unable to save provider config', e);
    }
  };

  // Main generation handler
  const handleGenerate = async () => {
    if (!topic.trim() || isGenerating || targetFormats.length === 0) return;

    setIsGenerating(true);
    setError(null);
    setGenerationStep(`Connecting to ${providerConfig.provider.toUpperCase()} (${providerConfig.model})...`);

    const stepInterval = setInterval(() => {
      setGenerationStep((prev) => {
        if (prev.includes('Connecting')) return 'Formulating B2B intent & Yoast keyphrase density...';
        if (prev.includes('Formulating')) return 'Generating 4 Output Formats (Inline & Clean in EN & ID)...';
        if (prev.includes('Generating')) return 'Computing Flesch readability metrics & 8K prompts...';
        return 'Finalizing multi-format WordPress package...';
      });
    }, 2600);

    try {
      const response = await fetch('/api/generate-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          focusKeyphrase: focusKeyphrase.trim() || undefined,
          secondaryKeywords: secondaryKeywords.trim() || undefined,
          lengthTarget,
          customWordCount,
          targetFormats,
          systemPromptOverride: systemPrompt,
          negativePromptOverride: negativePrompt,
          providerConfig,
        }),
      });

      clearInterval(stepInterval);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${response.status}`);
      }

      const articleData: GeneratedArticle = await response.json();
      setCurrentArticle(articleData);
      setActiveFormat('inline-en');

      // Add to history
      setHistory((prev) => [articleData, ...prev.filter((item) => item.id !== articleData.id)]);
    } catch (err: any) {
      clearInterval(stepInterval);
      console.error('Generation failed:', err);
      setError(err.message || 'An error occurred while generating. Please verify provider settings and try again.');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  // Keyboard Shortcuts handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // Close modals on Escape
      if (e.key === 'Escape') {
        setRulesModalOpen(false);
        setShortcutsModalOpen(false);
        setHistoryDrawerOpen(false);
        setProviderModalOpen(false);
        return;
      }

      // ⌘ + P : Open Provider settings modal
      if (isCmdOrCtrl && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setProviderModalOpen((prev) => !prev);
        return;
      }

      // ⌘ + / : Open shortcuts modal
      if (isCmdOrCtrl && e.key === '/') {
        e.preventDefault();
        setShortcutsModalOpen((prev) => !prev);
        return;
      }

      // ⌘ + , : Open rules modal
      if (isCmdOrCtrl && e.key === ',') {
        e.preventDefault();
        setRulesModalOpen((prev) => !prev);
        return;
      }

      // ⌘ + K : Focus topic input
      if (isCmdOrCtrl && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const input = document.getElementById('topic-input') as HTMLInputElement;
        input?.focus();
        input?.select();
        return;
      }

      // ⌘ + Enter : Generate
      if (isCmdOrCtrl && e.key === 'Enter') {
        e.preventDefault();
        if (topic.trim() && !isGenerating && targetFormats.length > 0) {
          handleGenerate();
        }
        return;
      }

      // Format switches (⌘1 to ⌘4)
      if (isCmdOrCtrl && currentArticle) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveFormat('inline-en');
        } else if (e.key === '2') {
          e.preventDefault();
          setActiveFormat('inline-id');
        } else if (e.key === '3') {
          e.preventDefault();
          setActiveFormat('clean-en');
        } else if (e.key === '4') {
          e.preventDefault();
          setActiveFormat('clean-id');
        }
      }

      // ⌘ + Shift + S : Download ZIP
      if (isCmdOrCtrl && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (currentArticle) {
          downloadAllAsZip(currentArticle);
        }
        return;
      }

      // ⌘ + Shift + C : Quick copy active format
      if (isCmdOrCtrl && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        if (currentArticle) {
          const textToCopy = currentArticle.formats[activeFormat] || currentArticle.inlineCssHtml;
          copyToClipboard(textToCopy);
        }
        return;
      }
    },
    [topic, isGenerating, currentArticle, activeFormat, targetFormats]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleResetRules = () => {
    setSystemPrompt(DEFAULT_BASE_SYSTEM_PROMPT);
    setNegativePrompt(DEFAULT_NEGATIVE_PROMPT);
    localStorage.removeItem('fitseo_system_prompt');
    localStorage.removeItem('fitseo_negative_prompt');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-zinc-800 selection:text-zinc-100 font-sans antialiased">
      {/* Header */}
      <Header
        onOpenRules={() => setRulesModalOpen(true)}
        onOpenShortcuts={() => setShortcutsModalOpen(true)}
        onOpenHistory={() => setHistoryDrawerOpen(true)}
        onOpenProviderSettings={() => setProviderModalOpen(true)}
        providerConfig={providerConfig}
        historyCount={history.length}
        serverStatus={serverStatus}
      />

      {/* Main Container - Focused Monochrome Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 h-100dvh">
        {/* Error notification banner */}
        {error && (
          <div className="bg-rose-950/80 border border-rose-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-200 text-xs sm:text-sm animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold text-rose-100 block">Generation Notice</span>
                <span>{error}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
              {providerConfig.model !== 'gemini-3.1-flash-lite' && (
                <button
                  onClick={() => {
                    const newConfig = { ...providerConfig, model: 'gemini-3.1-flash-lite' };
                    handleSaveProviderConfig(newConfig);
                    setError(null);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs font-mono font-medium transition-colors"
                >
                  Switch to Flash Lite
                </button>
              )}
              <button
                onClick={() => setProviderModalOpen(true)}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs font-mono font-medium transition-colors"
              >
                Provider Settings (⌘P)
              </button>
              <button
                onClick={() => setError(null)}
                className="text-rose-400 hover:text-rose-200 text-xs px-2 py-1.5 rounded"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Primary Distraction-Free Input Console with Focus Keyphrase & 4 Output Formats */}
        <TopicConsole
          topic={topic}
          setTopic={setTopic}
          focusKeyphrase={focusKeyphrase}
          setFocusKeyphrase={setFocusKeyphrase}
          secondaryKeywords={secondaryKeywords}
          setSecondaryKeywords={setSecondaryKeywords}
          targetFormats={targetFormats}
          setTargetFormats={setTargetFormats}
          lengthTarget={lengthTarget}
          setLengthTarget={setLengthTarget}
          customWordCount={customWordCount}
          setCustomWordCount={setCustomWordCount}
          isGenerating={isGenerating}
          onGenerate={handleGenerate}
        />

        {/* Dynamic Progress Indicator during AI Generation */}
        {isGenerating && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-4 animate-pulse">
            <div className="w-10 h-10 border-2 border-zinc-400 border-t-zinc-100 rounded-full animate-spin mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-200 font-mono tracking-wide">
                ARCHITECTING 4-FORMAT ARTICLE BUNDLE
              </h3>
              <p className="text-xs text-zinc-400 font-mono">
                {generationStep || 'Analyzing target audience, Flesch rhythm, and WordPress layout...'}
              </p>
            </div>
          </div>
        )}

        {/* Article Output Workspace when generated */}
        {currentArticle && !isGenerating && (
          <ArticleWorkspace
            article={currentArticle}
            onUpdateArticle={(updated) => {
              setCurrentArticle(updated);
              setHistory((prev) =>
                prev.map((item) => (item.id === updated.id ? updated : item))
              );
            }}
            activeFormat={activeFormat}
            onSelectFormat={setActiveFormat}
            providerConfig={providerConfig}
          />
        )}

        {/* Clean Empty State / Getting Started when no article is active */}
        {!currentArticle && !isGenerating && (
          <div className="border border-zinc-800/80 rounded-xl p-8 sm:p-12 text-center bg-zinc-900/30 space-y-8">
            <div className="max-w-xl mx-auto space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400">
                <Zap className="w-3.5 h-3.5 text-zinc-300" />
                <span>Four Output Formats &amp; Live Flesch Readability</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-zinc-100 tracking-tight">
                Complete B2B Commercial SEO Engine
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                Generates <span className="text-zinc-200 font-semibold">4 output formats</span> (Inline-EN, Inline-ID, Clean-EN, Clean-ID), runs live <span className="text-zinc-200 font-semibold">Flesch-Kincaid calculations</span> alongside preview, and audits content against a 17-point <span className="text-zinc-200 font-semibold">SEO Checklist</span>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto text-left text-xs">
              <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1.5">
                <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-zinc-400" />
                  <span>4 Output Formats</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  Inline-EN, Inline-ID, Clean-EN, and Clean-ID generated together for complete global publishing.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1.5">
                <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 text-zinc-400" />
                  <span>Flesch Calculator</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  Calculates Flesch Reading Ease (60–75 target), Grade Level, ASL, short sentences, and transition words.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1.5">
                <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-zinc-400" />
                  <span>Interactive SEO Checklist</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  17-point audit of headings, meta lengths, keyphrase density, no-H1 rules, and E-E-A-T stats.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1.5">
                <div className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-zinc-400" />
                  <span>1-Click 4-Format ZIP</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  Download all 4 HTML files, bilingual JSON metadata, and 8K AI prompts in a single archive.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="sticky bottom-0 left-0 border-t border-zinc-900 bg-zinc-900 py-4 px-6 text-center text-xs text-zinc-400 font-mono">
        Fisio Architect • Commercial SEO Strategy &amp; Multi-Provider AI Engine • Distraction-Free Workspace
      </footer>

      {/* Modals & Drawers */}
      <ProviderSettingsModal
        isOpen={providerModalOpen}
        onClose={() => setProviderModalOpen(false)}
        providerConfig={providerConfig}
        onSaveConfig={handleSaveProviderConfig}
      />

      <RulesModal
        isOpen={rulesModalOpen}
        onClose={() => setRulesModalOpen(false)}
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
        negativePrompt={negativePrompt}
        setNegativePrompt={setNegativePrompt}
        onReset={handleResetRules}
      />

      <ShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />

      <HistoryDrawer
        isOpen={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
        history={history}
        onSelectArticle={(selected) => {
          setCurrentArticle(selected);
          setTopic(selected.topic);
          setFocusKeyphrase(selected.focusKeyphrase || selected.seoMetadata.focusKeyphrase);
          setSecondaryKeywords(selected.secondaryKeywords || '');
          setLengthTarget(selected.lengthTarget);
          setActiveFormat('inline-en');
        }}
        onClearHistory={() => setHistory([])}
        onDeleteItem={(id) => setHistory((prev) => prev.filter((item) => item.id !== id))}
      />
    </div>
  );
}
