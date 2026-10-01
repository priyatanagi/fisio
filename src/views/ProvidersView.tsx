import React, { useState, useRef } from 'react';
import { Check } from 'lucide-react';
import { BrainCircuit, Search, Edit3, ClipboardCheck, Paintbrush } from 'lucide-react';
import type { AgentRole, MultiAgentConfig, ProviderConfig, ProviderType } from '../types/provider';
import { PROVIDER_PRESETS as PRESETS } from '../types/provider';

interface ProvidersViewProps {
  multiAgentConfig: MultiAgentConfig;
  onSave: (config: MultiAgentConfig) => void;
}

const ROLE_INFO: Record<AgentRole, { name: string; icon: React.ReactNode; desc: string }> = {
  judge: { name: 'Judge', icon: <BrainCircuit className="w-4 h-4" />, desc: 'Refines the article angle.' },
  impower: { name: 'Impower', icon: <Search className="w-4 h-4" />, desc: 'SEO research and brief.' },
  creator: { name: 'Creator', icon: <Edit3 className="w-4 h-4" />, desc: 'Writes the article markdown.' },
  reviewer: { name: 'Reviewer', icon: <ClipboardCheck className="w-4 h-4" />, desc: 'Fact-checks and audits SEO.' },
  designer: { name: 'Designer', icon: <Paintbrush className="w-4 h-4" />, desc: 'Renders the final HTML.' },
};

const ROLES = Object.keys(ROLE_INFO) as AgentRole[];

function keyPlaceholder(provider: ProviderType): string {
  if (provider === 'gemini') return 'Uses system GEMINI_API_KEY by default';
  if (provider === 'ollama') return 'Not required (local server)';
  if (provider === 'openai') return 'Uses system OPENAI_API_KEY by default';
  if (provider === 'anthropic') return 'Uses system ANTHROPIC_API_KEY by default';
  return 'Required';
}

export const ProvidersView: React.FC<ProvidersViewProps> = ({ multiAgentConfig, onSave }) => {
  const [activeRole, setActiveRole] = useState<AgentRole>('creator');
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The saved config is the single source of truth: every edit persists through
  // onSave and flows straight back as the `multiAgentConfig` prop, so there is
  // no unsaved draft to lose when navigating away.
  const config = multiAgentConfig[activeRole];
  const preset = PRESETS[config.provider];

  const flashSaved = () => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1200);
  };

  const update = (patch: Partial<ProviderConfig>) => {
    onSave({ ...multiAgentConfig, [activeRole]: { ...multiAgentConfig[activeRole], ...patch } });
    flashSaved();
  };

  const changeProvider = (provider: ProviderType) => {
    const savedFor = config.savedConfigs?.[provider];
    const nextPreset = PRESETS[provider];
    update({
      provider,
      model: savedFor?.model || nextPreset.defaultModel,
      apiKey: savedFor?.apiKey ?? '',
      baseUrl: savedFor?.baseUrl ?? nextPreset.defaultBaseUrl,
    });
    setTestResult(null);
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          model: config.model,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
        }),
      });
      const data = await res.json();
      setTestResult(
        res.ok && data.success
          ? { ok: true, message: data.message }
          : { ok: false, message: data.error ?? 'Connection test failed.' }
      );
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex gap-6">
        <div className="w-56 shrink-0 space-y-1">
          {ROLES.map((role) => (
            <button
              key={role}
              onClick={() => {
                setActiveRole(role);
                setTestResult(null);
              }}
              className={`w-full text-left p-3 rounded-lg flex items-start gap-3 transition-colors ${
                activeRole === role
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <span className={activeRole === role ? 'text-zinc-100' : 'text-zinc-500'}>
                {ROLE_INFO[role].icon}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">{ROLE_INFO[role].name}</span>
                <span className="block text-[10px] opacity-70 mt-0.5 leading-tight">
                  {ROLE_INFO[role].desc}
                </span>
                <span className="inline-block mt-1.5 px-1.5 py-0.5 bg-zinc-950/50 rounded font-mono border border-zinc-800 text-[9px]">
                  {multiAgentConfig[role].provider.toUpperCase()}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-100">
            Configuring <span className="text-emerald-400">{ROLE_INFO[activeRole].name}</span>
          </h3>

          <div className="grid grid-cols-2 gap-2">
            {(['gemini', 'openai', 'anthropic', 'ollama'] as ProviderType[]).map((provider) => (
              <button
                key={provider}
                onClick={() => changeProvider(provider)}
                className={`py-2 px-2 text-[11px] font-medium rounded-lg border transition-colors ${
                  config.provider === provider
                    ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                {PRESETS[provider].name}
              </button>
            ))}
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] text-zinc-400">Model identifier</span>
            <input
              type="text"
              value={config.model}
              onChange={(e) => update({ model: e.target.value })}
              list={`models-${activeRole}`}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
            />
            <datalist id={`models-${activeRole}`}>
              {preset.models.map((m) => (
                <option key={m.id} value={m.id} />
              ))}
            </datalist>
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] text-zinc-400">Base URL</span>
            <input
              type="text"
              value={config.baseUrl ?? ''}
              onChange={(e) => update({ baseUrl: e.target.value })}
              placeholder={preset.defaultBaseUrl || 'Default endpoint'}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] text-zinc-400">API key</span>
            <input
              type="password"
              value={config.apiKey ?? ''}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder={keyPlaceholder(config.provider)}
              disabled={config.provider === 'ollama'}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-50"
            />
          </label>

          <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
            <button
              onClick={test}
              disabled={testing}
              className="px-3 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] disabled:opacity-50"
            >
              {testing ? 'Testing...' : `Test ${ROLE_INFO[activeRole].name}`}
            </button>
            {testResult && (
              <span
                className={`text-[11px] flex-1 truncate ${
                  testResult.ok ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {testResult.message}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span
          className={`flex items-center gap-1.5 text-xs font-semibold transition-opacity ${
            saved ? 'text-emerald-400 opacity-100' : 'text-zinc-500 opacity-70'
          }`}
        >
          <Check className="w-3.5 h-3.5" />
          {saved ? 'Saved' : 'Auto-saves as you edit'}
        </span>
        <span className="text-[10px] font-mono text-zinc-600">
          Each field is stored per role immediately — no Apply step.
        </span>
      </div>
    </div>
  );
};
