import React, { useState, useEffect, useCallback } from 'react';

import { AppShell } from './app/AppShell';
import { useHashRoute, navigateTo, type RouteId } from './app/useHashRoute';
import { useArticleRun } from './app/useArticleRun';
import { upsertArticle } from './app/articleList';
import { sanitizePipelineConfig } from './app/pipelineConfig';

import { GenerateView } from './views/GenerateView';
import { BatchView } from './views/BatchView';
import { ProfileView } from './views/ProfileView';
import { HistoryView } from './views/HistoryView';
import { ProvidersView } from './views/ProvidersView';

import { runMigration } from './db/migrate';
import { listArticles, putArticle, deleteArticle } from './db';
import type { GeneratedArticle } from './types/article';
import type { RunRecord } from './types/run';
import type { MultiAgentConfig } from './types/provider';
import { DEFAULT_MULTI_AGENT_CONFIG } from './types/provider';
import type { UserProfile } from './types/profile';
import { DEFAULT_USER_PROFILE, isProfileConfigured } from './types/profile';
import type { UniversalRules } from './config/universalRules';
import { DEFAULT_UNIVERSAL_RULES } from './config/universalRules';
import type { PipelineConfig } from './pipeline/stages';
import { DEFAULT_PIPELINE_CONFIG } from './pipeline/stages';

function readJson<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`Unable to persist ${key}`, err);
    return false;
  }
}

export default function App() {
  const [route] = useHashRoute();

  const [profile, setProfile] = useState<UserProfile>(() =>
    readJson<UserProfile>('fitseo_profile', DEFAULT_USER_PROFILE)
  );
  const [multiAgentConfig, setMultiAgentConfig] = useState<MultiAgentConfig>(() =>
    readJson<MultiAgentConfig>('fitseo_multi_agent_config', DEFAULT_MULTI_AGENT_CONFIG)
  );
  const [universalRules, setUniversalRules] = useState<UniversalRules>(() =>
    readJson<UniversalRules>('fitseo_universal_rules', DEFAULT_UNIVERSAL_RULES)
  );
  const [pipelineConfig, setPipelineConfig] = useState<PipelineConfig>(() =>
    sanitizePipelineConfig(
      readJson<unknown>('fitseo_pipeline_config', undefined)
    )
  );

  const [articles, setArticles] = useState<GeneratedArticle[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [serverStatus, setServerStatus] = useState<'connected' | 'checking' | 'error'>('checking');
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  const handleSaveProfile = (next: UserProfile) => {
    setProfile(next);
    writeJson('fitseo_profile', next);
  };

  const handleSaveMultiAgent = (next: MultiAgentConfig) => {
    setMultiAgentConfig(next);
    writeJson('fitseo_multi_agent_config', next);
  };

  const handleSaveRules = (next: UniversalRules) => {
    setUniversalRules(next);
    writeJson('fitseo_universal_rules', next);
  };

  const handleSavePipeline = (next: PipelineConfig) => {
    // A toggle that looks switched off but never reached storage comes back on
    // the next load, which reads as "the panel ignored me". Show that instead.
    const sanitized = sanitizePipelineConfig(next);
    setPipelineConfig(sanitized);
    if (!writeJson('fitseo_pipeline_config', sanitized)) {
      setStorageWarning('Pipeline settings could not be saved to this browser, so they reset on reload.');
    }
  };

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setServerStatus(data.status === 'ok' ? 'connected' : 'error'))
      .catch(() => setServerStatus('error'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    runMigration()
      .then(() => listArticles())
      .then((loaded) => {
        if (!cancelled) {
          setArticles(loaded);
          setIsDbLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setIsDbLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDeleteArticle = useCallback(async (id: string) => {
    await deleteArticle(id);
    setArticles((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleUpdateArticle = useCallback(async (updated: GeneratedArticle) => {
    await putArticle(updated);
    // upsert, not map: a first-time article has no id in state yet, and map()
    // alone dropped every new generation from History until a reload.
    setArticles((prev) => upsertArticle(prev, updated));
  }, []);

  // The run lives above the router so switching views cannot kill a
  // generation in progress or wipe the topic that was typed in.
  const run = useArticleRun({
    profile,
    multiAgentConfig,
    universalRules,
    pipelineConfig,
    onArticleSaved: handleUpdateArticle,
  });

  const handleRetryRun = useCallback(
    (record: RunRecord) => {
      navigateTo('generate');
      void run.retryRun(record);
    },
    [run]
  );

  const handleForgetRun = useCallback(
    (runId: string) => {
      void run.forgetRun(runId);
    },
    [run]
  );

  // Ctrl/Cmd + 1..5 switch views, mirroring the existing Cmd+1..4 format shortcuts.
  useEffect(() => {
    const ids: RouteId[] = ['generate', 'batch', 'profile', 'history', 'providers'];
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      const index = Number.parseInt(e.key, 10) - 1;
      if (Number.isInteger(index) && index >= 0 && index < ids.length) {
        e.preventDefault();
        navigateTo(ids[index]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const shared = { profile, multiAgentConfig, universalRules, pipelineConfig };

  let content: React.ReactNode;
  switch (route) {
    case 'batch':
      content = <BatchView {...shared} />;
      break;
    case 'profile':
      content = (
        <ProfileView
          profile={profile}
          onSave={handleSaveProfile}
          universalRules={universalRules}
          onSaveRules={handleSaveRules}
        />
      );
      break;
    case 'history':
      content = (
        <HistoryView
          articles={articles}
          runs={run.runs}
          isLoaded={isDbLoaded}
          onDelete={handleDeleteArticle}
          onOpen={(article) => {
            sessionStorage.setItem('fisio:openArticleId', article.id);
            navigateTo('generate');
          }}
          onRetryRun={handleRetryRun}
          onForgetRun={handleForgetRun}
        />
      );
      break;
    case 'providers':
      content = (
        <ProvidersView
          multiAgentConfig={multiAgentConfig}
          onSave={handleSaveMultiAgent}
        />
      );
      break;
    default:
      content = (
        <GenerateView
          profile={profile}
          pipelineConfig={pipelineConfig}
          onPipelineChange={handleSavePipeline}
          articles={articles}
          onUpdateArticle={handleUpdateArticle}
          run={run}
        />
      );
  }

  return (
    <AppShell
      activeRoute={route}
      historyCount={articles.length}
      profileConfigured={isProfileConfigured(profile)}
      serverStatus={serverStatus}
    >
      {storageWarning && (
        <div className="px-4 sm:px-6 lg:px-8 pt-4">
          <div className="max-w-7xl mx-auto bg-amber-950/80 border border-amber-800 rounded-xl px-4 py-3 flex items-start gap-2.5 text-amber-200 text-xs">
            <span className="flex-1">{storageWarning}</span>
            <button onClick={() => setStorageWarning(null)} className="text-amber-400 hover:text-amber-200">
              Dismiss
            </button>
          </div>
        </div>
      )}
      {content}
    </AppShell>
  );
}
