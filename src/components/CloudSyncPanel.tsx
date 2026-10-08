import React, { useState } from 'react';
import { Cloud, CloudOff, RefreshCw, Check } from 'lucide-react';
import { noAutofillSecretProps } from '../utils/autofillGuard';
import type { CloudSyncController } from '../sync/useCloudSync';

interface CloudSyncPanelProps {
  cloud: CloudSyncController;
}

const STATUS_LABEL: Record<CloudSyncController['status'], string> = {
  off: 'Not connected',
  idle: 'Idle',
  syncing: 'Syncing…',
  offline: 'Offline — changes are queued',
  error: 'Last attempt failed',
};

function formatStamp(iso: string): string {
  if (!iso) return 'never';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? 'never' : at.toLocaleString();
}

/**
 * Cloud storage settings. The only secret here is typed by the user and kept in
 * this browser: nothing about the workspace key is written to the bundle, to
 * .env, or to git, which is what makes the row level policies meaningful.
 */
export const CloudSyncPanel: React.FC<CloudSyncPanelProps> = ({ cloud }) => {
  const [draft, setDraft] = useState('');
  const [suggested, setSuggested] = useState('');
  const [report, setReport] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    setReport(null);
    try {
      const result = await cloud.testConnection();
      setReport(result.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <header className="flex items-start gap-3">
        {cloud.active ? (
          <Cloud className="w-4 h-4 text-emerald-400 mt-0.5" />
        ) : (
          <CloudOff className="w-4 h-4 text-zinc-500 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-100">Cloud storage (Supabase)</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Stores generated articles with their full version history, plus the profile rules,
            design tokens and pipeline settings. API keys and provider choices stay in this browser
            and are never uploaded.
          </p>
        </div>
        <span
          className={`text-[11px] font-medium ${
            cloud.status === 'error' || cloud.status === 'offline'
              ? 'text-amber-400'
              : cloud.status === 'syncing'
                ? 'text-sky-400'
                : 'text-zinc-400'
          }`}
        >
          {STATUS_LABEL[cloud.status]}
        </span>
      </header>

      {!cloud.envConfigured && (
        <div className="rounded-lg border border-amber-900 bg-amber-950/50 p-3 text-[11px] text-amber-200 space-y-1">
          <p className="font-semibold">Supabase is not configured for this build.</p>
          <p>
            Set <code className="text-amber-100">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-amber-100">VITE_SUPABASE_ANON_KEY</code> in your environment and
            restart the app. Both are public values — the app refuses to run if a service_role key
            is present.
          </p>
          <p>
            {cloud.envError ??
              'Then run supabase/schema.sql once in the project’s SQL editor to create the tables and policies.'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <label className="block space-y-1">
          <span className="text-[11px] text-zinc-400">Workspace secret</span>
          <input
            type="password"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              cloud.secretSet
                ? 'Saved on this device — type a new one to replace it'
                : 'Paste the secret you generated for this workspace'
            }
            {...noAutofillSecretProps('cloud-workspace-secret')}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
          />
        </label>

        {suggested && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-1.5">
            <p className="text-[11px] text-zinc-400">
              New secret generated. Copy it to every device that will use this workspace — it is not
              recoverable from Supabase, only from here.
            </p>
            <p className="text-[11px] font-mono text-emerald-300 break-all select-all">{suggested}</p>
            <button
              onClick={() => cloud.saveSecret(suggested)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-[11px]"
            >
              Use this secret
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSuggested(cloud.suggestSecret())}
            className="px-3 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px]"
          >
            Generate new secret
          </button>
          <button
            onClick={() => {
              if (!draft.trim()) return;
              cloud.saveSecret(draft);
              setDraft('');
              setSuggested('');
              setReport(null);
            }}
            disabled={!draft.trim()}
            className="px-3 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-[11px] font-medium disabled:opacity-40"
          >
            Save secret
          </button>
          {cloud.secretSet && (
            <button
              onClick={() => {
                cloud.saveSecret('');
                setReport(null);
              }}
              className="px-3 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 text-[11px]"
            >
              Disconnect this device
            </button>
          )}
          <button
            onClick={test}
            disabled={!cloud.active || testing}
            className="px-3 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] disabled:opacity-40"
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button
            onClick={() => void cloud.syncNow()}
            disabled={!cloud.active || cloud.status === 'syncing'}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${cloud.status === 'syncing' ? 'animate-spin' : ''}`} />
            Sync now
          </button>
        </div>

        <label className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={cloud.autoSync}
            onChange={(event) => cloud.setAutoSync(event.target.checked)}
            className="accent-emerald-500"
          />
          Upload automatically after each save (pull still runs when the app opens)
        </label>
      </div>

      <div className="pt-3 border-t border-zinc-800 space-y-1 text-[11px] text-zinc-500">
        <p>
          <Check className="w-3 h-3 inline text-zinc-600" /> Last synced {formatStamp(cloud.lastSyncedAt)}
          {cloud.pendingCount > 0 && ` · ${cloud.pendingCount} change(s) waiting to upload`}
        </p>
        {cloud.message && <p className="text-zinc-400">{cloud.message}</p>}
        {report && <p className="text-zinc-300">{report}</p>}
      </div>
    </section>
  );
};
