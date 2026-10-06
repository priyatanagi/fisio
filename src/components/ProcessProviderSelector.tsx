import React, { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import type { AgentRole, MultiAgentConfig, ProviderType } from '../types/provider';
import { PROVIDER_PRESETS } from '../types/provider';
import { ModelPicker } from './ModelPicker';

interface ProcessProviderSelectorProps {
  config: MultiAgentConfig;
  onChange: (config: MultiAgentConfig) => void;
}

const ROLES: AgentRole[] = ['judge', 'impower', 'creator', 'reviewer', 'designer'];
const PROVIDERS: ProviderType[] = ['gemini', 'openai', 'anthropic', 'ollama'];

function applyToEveryAgent(
  config: MultiAgentConfig,
  provider: ProviderType,
  model: string
): MultiAgentConfig {
  const next = { ...config };

  for (const role of ROLES) {
    const current = config[role];
    const savedConfigs = { ...(current.savedConfigs ?? {}) };
    savedConfigs[current.provider] = {
      model: current.model,
      apiKey: current.apiKey ?? '',
      baseUrl: current.baseUrl || PROVIDER_PRESETS[current.provider].defaultBaseUrl,
    };
    const selected = savedConfigs[provider] ?? {
      model: PROVIDER_PRESETS[provider].defaultModel,
      apiKey: '',
      baseUrl: PROVIDER_PRESETS[provider].defaultBaseUrl,
    };

    next[role] = {
      ...current,
      provider,
      model,
      apiKey: selected.apiKey,
      baseUrl: selected.baseUrl || PROVIDER_PRESETS[provider].defaultBaseUrl,
      savedConfigs: {
        ...savedConfigs,
        [provider]: { ...selected, model },
      },
    };
  }

  return next;
}

export const ProcessProviderSelector: React.FC<ProcessProviderSelectorProps> = ({ config, onChange }) => {
  const [open, setOpen] = useState(false);
  const active = config.creator;
  const isUnified = ROLES.every(
    (role) => config[role].provider === active.provider && config[role].model === active.model
  );

  const apply = (provider: ProviderType, model: string) => {
    onChange(applyToEveryAgent(config, provider, model));
  };

  const chooseProvider = (provider: ProviderType) => {
    const model = provider === active.provider
      ? active.model
      : active.savedConfigs?.[provider]?.model || PROVIDER_PRESETS[provider].defaultModel;
    apply(provider, model);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-zinc-800/50"
      >
        <span className="flex min-w-0 items-center gap-3">
          <Sparkles className="h-4 w-4 shrink-0 text-teal-400" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-zinc-100">AI provider for the entire process</span>
            <span className="mt-0.5 block truncate text-[11px] text-zinc-400">
              {isUnified ? `${PROVIDER_PRESETS[active.provider].name} · ${active.model}` : 'Agents currently use different models'}
            </span>
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-zinc-800 p-4">
          <p className="text-[11px] text-zinc-400">
            Choose one provider and model for Judge, Impower, Creator, Reviewer, and Designer. Each agent keeps its own saved key and endpoint.
          </p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PROVIDERS.map((provider) => (
              <button
                key={provider}
                type="button"
                aria-pressed={active.provider === provider}
                onClick={() => chooseProvider(provider)}
                className={`rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors ${active.provider === provider ? 'border-teal-500/60 bg-teal-950/50 text-teal-200' : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'}`}
              >
                {PROVIDER_PRESETS[provider].name}
              </button>
            ))}
          </div>

          <div className="max-w-xl">
            <ModelPicker
              provider={active.provider}
              model={active.model}
              baseUrl={active.baseUrl}
              apiKey={active.apiKey}
              onChange={(model) => apply(active.provider, model)}
            />
          </div>
          <p className="text-[10px] text-emerald-400" role="status" aria-live="polite">
            Changes apply to all agents and save automatically.
          </p>
        </div>
      )}
    </div>
  );
};
