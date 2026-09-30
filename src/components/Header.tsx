import React from 'react';
import { Sliders, Keyboard, History, Cpu, Globe } from 'lucide-react';
import { ProviderConfig, PROVIDER_PRESETS } from '../types/provider';

interface HeaderProps {
  onOpenRules: () => void;
  onOpenShortcuts: () => void;
  onOpenHistory: () => void;
  onOpenProviderSettings: () => void;
  providerConfig: ProviderConfig;
  historyCount: number;
  serverStatus: 'connected' | 'checking' | 'error';
}

export const Header: React.FC<HeaderProps> = ({
  onOpenRules,
  onOpenShortcuts,
  onOpenHistory,
  onOpenProviderSettings,
  providerConfig,
  historyCount,
  serverStatus,
}) => {
  const providerInfo = PROVIDER_PRESETS[providerConfig.provider];

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3.5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 flex-nowrap overflow-hidden">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3 min-w-0 shrink">
          <div className="w-8 h-8 rounded bg-zinc-100 text-zinc-950 flex items-center justify-center font-black text-sm tracking-tighter shadow-sm">
            FS
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-zinc-100">Fisio Architect</h1>
              <span className="text-[11px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 shrink-0 hidden md:inline-block">
                B2B Commercial
              </span>
            </div>
            <p className="text-[12px] text-zinc-400 hidden sm:block truncate">
              Power Engine Keyword Strategy & Multi-Provider AI Content Engine
            </p>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Active AI Provider Switcher Button */}
          <button
            onClick={onOpenProviderSettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-xs font-mono transition-colors shadow-xs"
            title="Configure AI Agent Provider (Gemini / OpenAI Compatible / Anthropic)"
          >
            <Cpu className="w-3.5 h-3.5 text-zinc-400" />
            <span className="font-semibold text-zinc-100">{providerInfo.name.split(' ')[0]}</span>
            <span className="text-zinc-400 hidden lg:inline truncate max-w-[110px]">
              ({providerConfig.model})
            </span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${serverStatus === 'connected'
                ? 'bg-emerald-400 animate-pulse'
                : serverStatus === 'error'
                  ? 'bg-rose-500'
                  : 'bg-amber-400'
                }`}
            />
          </button>

          {/* History Button */}
          <button
            onClick={onOpenHistory}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs transition-colors"
            title="Recent Generations"
          >
            <History className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">History</span>
            {historyCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-zinc-800 text-[10px] font-mono text-zinc-300">
                {historyCount}
              </span>
            )}
          </button>

          {/* Rules / System Prompt Button */}
          <button
            onClick={onOpenRules}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs transition-colors"
            title="Edit Base Strategy Prompt & Negative Rules (⌘,)"
          >
            <Sliders className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Strategy Rules</span>
          </button>

          {/* Shortcuts Button */}
          <button
            onClick={onOpenShortcuts}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs transition-colors"
            title="Keyboard Shortcuts (⌘/)"
          >
            <Keyboard className="w-3.5 h-3.5 text-zinc-400" />
            <kbd className="hidden xl:inline text-[10px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">
              ⌘/
            </kbd>
          </button>
        </div>
      </div>
    </header>
  );
};
