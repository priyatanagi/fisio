import React from 'react';
import type { ImpowerLevel, PipelineConfig, ReviewerMode } from '../pipeline/stages';

interface PipelineSettingsPanelProps {
  config: PipelineConfig;
  onChange: (config: PipelineConfig) => void;
}

const IMPOWER_OPTIONS: { id: ImpowerLevel; label: string; hint: string }[] = [
  { id: 'off', label: 'Off', hint: 'Creator plans itself. 0 extra calls.' },
  { id: 'lite', label: 'Lite', hint: 'Metadata + 5 keywords. 1 call.' },
  { id: 'standard', label: 'Standard', hint: 'Full brief with outline. 1 call.' },
  { id: 'max', label: 'Max', hint: 'Keyword research then brief. 2 calls.' },
];

const REVIEWER_OPTIONS: { id: ReviewerMode; label: string; hint: string }[] = [
  { id: 'off', label: 'Off', hint: 'No review. 0 calls.' },
  { id: 'advisory', label: 'Advisory', hint: 'Reports but never blocks. 1 call.' },
  { id: 'strict', label: 'Strict', hint: 'Blocks with one auto-revision. 1-2 calls.' },
];

export const PipelineSettingsPanel: React.FC<PipelineSettingsPanelProps> = ({ config, onChange }) => {
  const set = <K extends keyof PipelineConfig>(key: K, value: PipelineConfig[K]) =>
    onChange({ ...config, [key]: value });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-5">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-zinc-200">Pipeline stages</h3>
        <p className="text-[11px] text-zinc-500">
          Creator and Designer always run. Everything else is optional.
        </p>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={config.judge}
          onChange={(e) => set('judge', e.target.checked)}
          className="mt-0.5 accent-zinc-100"
        />
        <span className="space-y-0.5">
          <span className="block text-xs text-zinc-200">Judge — refine the topic angle</span>
          <span className="block text-[11px] text-zinc-500">
            Evaluates the seed against your target market. 1 call.
          </span>
        </span>
      </label>

      <div className="space-y-1.5">
        <span className="block text-xs text-zinc-200">Impower — SEO research depth</span>
        <div className="grid grid-cols-4 gap-1.5">
          {IMPOWER_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => set('impower', option.id)}
              title={option.hint}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                config.impower === option.id
                  ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="block text-[11px] text-zinc-500">
          {IMPOWER_OPTIONS.find((o) => o.id === config.impower)?.hint}
        </span>
      </div>

      <div className="space-y-1.5">
        <span className="block text-xs text-zinc-200">Reviewer — quality gate</span>
        <div className="grid grid-cols-3 gap-1.5">
          {REVIEWER_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => set('reviewer', option.id)}
              title={option.hint}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                config.reviewer === option.id
                  ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="block text-[11px] text-zinc-500">
          {REVIEWER_OPTIONS.find((o) => o.id === config.reviewer)?.hint}
        </span>
      </div>
    </div>
  );
};
