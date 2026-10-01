import React, { useMemo, useState } from 'react';
import { Monitor, Tablet, Smartphone, AlertTriangle, Code2, Eye } from 'lucide-react';
import type { BrandWarning } from '../pipeline/stages';
import type { UserProfile } from '../types/profile';
import { applyBrandTokens } from '../utils/brandTokens';

interface HtmlPreviewPaneProps {
  html: string;
  profile: UserProfile;
}

const VIEWPORTS = {
  desktop: { width: '100%', icon: Monitor, label: 'Desktop' },
  tablet: { width: '768px', icon: Tablet, label: 'Tablet' },
  mobile: { width: '375px', icon: Smartphone, label: 'Mobile' },
} as const;

type ViewportId = keyof typeof VIEWPORTS;

export const HtmlPreviewPane: React.FC<HtmlPreviewPaneProps> = ({ html, profile }) => {
  const [viewport, setViewport] = useState<ViewportId>('desktop');
  const [showSource, setShowSource] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [forcePalette, setForcePalette] = useState(false);

  const result = useMemo(
    () => applyBrandTokens(html, profile.designRules, { forcePalette }),
    [html, profile.designRules, forcePalette]
  );

  const warningTotal = result.warnings.reduce((sum, w) => sum + w.occurrences, 0);
  const showWarnings = result.warnings.length > 0 && !dismissed;
  const Active = VIEWPORTS[viewport].icon;

  if (!html) {
    return (
      <div className="py-16 text-center text-xs text-zinc-500">
        No HTML for this format yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {(Object.keys(VIEWPORTS) as ViewportId[]).map((id) => {
            const V = VIEWPORTS[id];
            const Icon = V.icon;
            return (
              <button
                key={id}
                onClick={() => setViewport(id)}
                title={V.label}
                className={`p-1.5 rounded-lg border transition-colors ${
                  viewport === id
                    ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSource((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] flex items-center gap-1.5 ${
              showSource
                ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {showSource ? <Eye className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
            {showSource ? 'Preview' : 'Source'}
          </button>
        </div>
      </div>

      {showWarnings && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-950/40 border border-amber-900 rounded-lg text-[11px] text-amber-300 flex-wrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">
            {result.warnings.length} off-palette colour{warningTotal > 0 ? ` (${warningTotal} uses)` : ''} detected:{' '}
            <span className="font-mono">{result.warnings.map((w: BrandWarning) => w.hex).join(', ')}</span>
          </span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={forcePalette}
              onChange={(e) => {
                setForcePalette(e.target.checked);
                setDismissed(false);
              }}
              className="accent-amber-400"
            />
            Force palette
          </label>
          <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-200">
            Dismiss
          </button>
        </div>
      )}

      {showSource ? (
        <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[11px] font-mono text-zinc-300 overflow-auto max-h-[70vh] whitespace-pre-wrap break-all">
          {result.html}
        </pre>
      ) : (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2 overflow-auto">
          <iframe
            // allow-same-origin is deliberately omitted: generated HTML is
            // untrusted and must not reach app storage or cookies.
            sandbox="allow-scripts allow-popups allow-forms"
            srcDoc={result.html}
            title="HTML preview"
            className="bg-white rounded-lg border-0 transition-all"
            style={{ width: VIEWPORTS[viewport].width, height: '70vh' }}
          />
        </div>
      )}

      <div className="text-[10px] font-mono text-zinc-600 flex items-center gap-1.5">
        <Active className="w-3 h-3" />
        {VIEWPORTS[viewport].label} — {VIEWPORTS[viewport].width} — sandboxed, opaque origin
      </div>
    </div>
  );
};
