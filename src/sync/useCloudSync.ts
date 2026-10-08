/**
 * React glue for cloud sync. Every decision lives in syncEngine; this file owns
 * timing only — when a cycle runs, how long a failure waits before retrying, and
 * what the UI should say. The latest callbacks are kept in a ref so a scheduled
 * retry can never run against a stale closure.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteArticle, getArticle, listArticles, putArticle } from '../db';
import type { GeneratedArticle } from '../types/article';
import {
  generateWorkspaceSecret,
  getLastSyncedAt,
  getWorkspaceSecret,
  isAutoSyncEnabled,
  readCloudEnv,
  setAutoSyncEnabled,
  setLastSyncedAt,
  setSettingsSavedAt,
  setWorkspaceSecret,
} from './cloudConfig';
import { cloudQueue } from './syncQueue';
import { cloudTombstones } from './tombstones';
import {
  deleteArticleEverywhere,
  nextRetryDelay,
  runPushCycle,
  runSyncCycle,
  testCloudConnection,
  type SyncEngineDeps,
} from './syncEngine';
import type { CloudSettings } from './syncMerge';

export type CloudStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

export interface CloudSyncOptions {
  /** IndexedDB has been read, so a pull cannot race the first local load. */
  ready: boolean;
  /** Read lazily: a cycle must push what is current, not what was current at mount. */
  currentSettings: () => CloudSettings;
  /** The cloud document is newer than this device's — App owns applying it. */
  onSettingsFromCloud: (settings: CloudSettings) => void;
  /** A pull wrote rows, so App should re-read its History state. */
  onLocalChanged: () => void;
}

export interface CloudSyncController {
  /** Env values plus a workspace secret: sync can actually run. */
  active: boolean;
  envConfigured: boolean;
  /** Why the env is unusable, when it is (never a key value). */
  envError?: string;
  secretSet: boolean;
  status: CloudStatus;
  message: string;
  lastSyncedAt: string;
  pendingCount: number;
  autoSync: boolean;
  suggestSecret: () => string;
  saveSecret: (secret: string) => void;
  setAutoSync: (enabled: boolean) => void;
  syncNow: () => Promise<void>;
  testConnection: () => Promise<{ ok: boolean; message: string }>;
  articleSaved: (article: GeneratedArticle) => void;
  settingsChanged: () => void;
  articleDeleted: (id: string) => Promise<void>;
}

const PUSH_DEBOUNCE_MS = 1_500;

/**
 * The persisted queue and tombstone lists are read once per page load. Every
 * entry point waits for this, so a pull can never run against an unhydrated
 * queue and mark offline work as uploaded.
 */
let hydration: Promise<void> | null = null;
function ensureHydrated(): Promise<void> {
  if (!hydration) {
    hydration = Promise.all([cloudQueue.hydrate(), cloudTombstones.hydrate()]).then(() => undefined);
  }
  return hydration;
}

function pendingTotal(): number {
  const pending = cloudQueue.pending();
  return pending.articleIds.length + (pending.settingsDirty ? 1 : 0);
}

export function useCloudSync(options: CloudSyncOptions): CloudSyncController {
  const latest = useRef(options);
  latest.current = options;

  const env = readCloudEnv();
  const [secretSet, setSecretSet] = useState(() => Boolean(getWorkspaceSecret()));
  const [autoSync, setAutoSyncState] = useState(() => isAutoSyncEnabled());
  const [status, setStatus] = useState<CloudStatus>(() =>
    env.configured && getWorkspaceSecret() ? 'idle' : 'off'
  );
  const [message, setMessage] = useState('');
  const [lastSyncedAt, setLastSynced] = useState(() => getLastSyncedAt());
  const [pendingCount, setPendingCount] = useState(0);

  const running = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deps: SyncEngineDeps = {
    config: () => {
      const fresh = readCloudEnv();
      const secret = getWorkspaceSecret();
      if (!fresh.configured || !secret) return null;
      return { url: fresh.url, anonKey: fresh.anonKey, secret };
    },
    queue: cloudQueue,
    tombstones: cloudTombstones,
    listLocal: () => listArticles(),
    getLocal: (id) => getArticle(id).then((found) => found ?? undefined),
    writeLocal: (article) => putArticle(article),
    removeLocal: (id) => deleteArticle(id),
    readSettings: () => latest.current.currentSettings(),
    applySettings: (settings) => latest.current.onSettingsFromCloud(settings),
    // The engine substituted a real timestamp for a device that never saved its
    // rules; remember it so the next cycle does not invent an even newer one.
    onSettingsStamped: (iso) => setSettingsSavedAt(iso),
  };

  const runCycle = useCallback(
    async (kind: 'full' | 'push'): Promise<void> => {
      if (running.current) return;
      if (!deps.config()) {
        setStatus('off');
        return;
      }
      running.current = true;
      setStatus('syncing');
      try {
        const result = kind === 'full' ? await runSyncCycle(deps) : await runPushCycle(deps);
        if (result.error) {
          setStatus(result.kind === 'network' ? 'offline' : 'error');
          setMessage(result.error);
          const delay = nextRetryDelay(cloudQueue.failure().attempts);
          if (delay && isAutoSyncEnabled()) {
            if (retry.current) clearTimeout(retry.current);
            retry.current = setTimeout(() => void runCycle('push'), delay);
          }
          return;
        }
        const now = new Date().toISOString();
        setLastSyncedAt(now);
        setLastSynced(now);
        setStatus('idle');
        const uploaded = result.pushed.articles + (result.pushed.settings ? 1 : 0);
        const downloaded = result.pulled.added + result.pulled.updated;
        if (kind === 'full' && downloaded > 0) {
          setMessage(`Synced — ${downloaded} item(s) came down, ${uploaded} went up.`);
          latest.current.onLocalChanged();
        } else {
          setMessage(uploaded > 0 ? `Synced — ${uploaded} item(s) uploaded.` : 'Up to date.');
        }
      } finally {
        running.current = false;
      }
    },
    // deps reads only module-level singletons and the `latest` ref, so one
    // stable instance is enough for the lifetime of the component.
    []
  );

  // `ready` turns true exactly once, after the IndexedDB load. That is the first
  // moment a pull is meaningful: it merges into state that is already loaded.
  useEffect(() => {
    if (!options.ready) return;
    let cancelled = false;
    void ensureHydrated().then(async () => {
      if (cancelled) return;
      setPendingCount(pendingTotal());
      if (deps.config()) await runCycle('full');
    });
    return () => {
      cancelled = true;
    };
  }, [options.ready, runCycle]);

  useEffect(() => cloudQueue.subscribe((pending) => {
    setPendingCount(pending.articleIds.length + (pending.settingsDirty ? 1 : 0));
  }), []);

  // One local change means one upload, not one per keystroke: a batch run writes
  // dozens of articles within seconds.
  useEffect(() => {
    if (!autoSync || !env.configured || !secretSet || pendingCount === 0) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void runCycle('push'), PUSH_DEBOUNCE_MS);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [pendingCount, autoSync, env.configured, secretSet, runCycle]);

  // Coming back online should drain whatever the offline queue kept.
  useEffect(() => {
    const onOnline = () => void runCycle('push');
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      if (debounce.current) clearTimeout(debounce.current);
      if (retry.current) clearTimeout(retry.current);
    };
  }, [runCycle]);

  return {
    active: env.configured && secretSet,
    envConfigured: env.configured,
    envError: env.configured ? undefined : env.error,
    secretSet,
    status,
    message,
    lastSyncedAt,
    pendingCount,
    autoSync,
    suggestSecret: () => generateWorkspaceSecret(),
    saveSecret: (secret) => {
      setWorkspaceSecret(secret);
      const present = Boolean(secret.trim());
      setSecretSet(present);
      setStatus(present && env.configured ? 'idle' : 'off');
      setMessage('');
      if (present) void runCycle('full');
    },
    setAutoSync: (enabled) => {
      setAutoSyncEnabled(enabled);
      setAutoSyncState(enabled);
    },
    syncNow: () => runCycle('full'),
    testConnection: () => testCloudConnection(deps),
    articleSaved: (article) => cloudQueue.addArticle(article.id),
    settingsChanged: () => cloudQueue.addSettings(),
    articleDeleted: async (id) => {
      await deleteArticleEverywhere(deps, id);
      latest.current.onLocalChanged();
    },
  };
}
