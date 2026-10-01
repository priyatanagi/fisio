import React, { useState, useEffect, useCallback } from 'react';

import { AppShell } from './app/AppShell';
import { useHashRoute, navigateTo, type RouteId } from './app/useHashRoute';

import { GenerateView } from './views/GenerateView';
import { BatchView } from './views/BatchView';
import { ProfileView } from './views/ProfileView';
import { HistoryView } from './views/HistoryView';
import { ProvidersView } from './views/ProvidersView';

import { runMigration } from './db/migrate';
import { listArticles, putArticle, deleteArticle } from './db';
import type { GeneratedArticle } from './types/article';
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

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Unable to persist ${key}`, err);
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
    readJson<PipelineConfig>('fitseo_pipeline_config', DEFAULT_PIPELINE_CONFIG)
  );

  const [articles, setArticles] = useState<GeneratedArticle[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [serverStatus, setServerStatus] = useState<'connected' | 'checking' | 'error'>('checking');

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
    setPipelineConfig(next);
    writeJson('fitseo_pipeline_config', next);
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
    setArticles((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

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
          isLoaded={isDbLoaded}
          onDelete={handleDeleteArticle}
          onOpen={(article) => {
            sessionStorage.setItem('fisio:openArticleId', article.id);
            navigateTo('generate');
          }}
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
          {...shared}
          onPipelineChange={handleSavePipeline}
          articles={articles}
          onUpdateArticle={handleUpdateArticle}
          error={null}
          serverStatus={serverStatus}
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
      {content}
    </AppShell>
  );
}
