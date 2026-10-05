import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { DesignRules } from '../types/profile';
import { diffRules } from '../config/brandPresets';

interface RuleDiffPanelProps {
  saved: DesignRules;
  draft: DesignRules;
}

/**
 * Shows what a token edit actually changed, so a brand revision is reviewable
 * before it overwrites a working profile.
 */
export const RuleDiffPanel: React.FC<RuleDiffPanelProps> = ({ saved, draft }) => {
  const diffs = diffRules(saved, draft);
  if (diffs.length === 0) return null;

  return (
    <div className="bg-amber-950/30 border border-amber-900/70 rounded-xl p-3">
      <h3 className="text-[11px] font-semibold text-amber-300">
        {diffs.length} unsaved change{diffss(diffs.length)}
      </h3>
      <ul className="mt-2 space-y-1">
        {diffs.map((diff) => (
          <li key={diff.key} className="flex items-center gap-2 text-[10px]">
            <span className="text-zinc-400 w-24 shrink-0 truncate">{diff.label}</span>
            <span className="font-mono text-zinc-500 line-through truncate max-w-[9rem]">{diff.from}</span>
            <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
            <span className="font-mono text-amber-200 truncate">{diff.to}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const diffss = (n: number) => (n > 1 ? 's' : '');