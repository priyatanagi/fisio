import React, { useState } from 'react';
import { AlertTriangle, Check, Download, Upload, X } from 'lucide-react';
import type { DesignRules } from '../types/profile';
import { BRAND_PRESETS, applyPreset, exportPreset, importPreset, type FormatOverrides, setFormatOverride } from '../config/brandPresets';
import { ALL_TOKENS, readToken } from '../config/designTokens';
import { validateContrast } from '../config/tokenContrast';

interface BrandKitPanelProps {
  rules: DesignRules;
  onApplyPreset: (presetId: string) => void;
  overrides: FormatOverrides;
  onOverrideChange: (next: FormatOverrides) => void;
}

const OUTPUT_FORMATS = [
  { id: 'inline-en', label: 'Inline CSS (EN)' },
  { id: 'inline-id', label: 'Inline CSS (ID)' },
  { id: 'clean-en', label: 'Clean HTML (EN)' },
  { id: 'clean-id', label: 'Clean HTML (ID)' },
];

/** Only the structural styles are worth overriding per format; colour stays global. */
const OVERRIDE_TOKENS = ALL_TOKENS.filter(
  (t) => t.kind === 'choice' && t.key !== 'blockquoteStyle' ? true : t.kind === 'choice'
).filter((t) => !['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'textColor'].includes(t.key));

export const BrandKitPanel: React.FC<BrandKitPanelProps> = ({
  rules,
  onApplyPreset,
  overrides,
  onOverrideChange,
}) => {
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [showExport, setShowExport] = useState(false);

  const issues = validateContrast(rules);

  const doExport = () => {
    const kit = exportPreset('My brand kit', rules, 'Exported from the profile page.');
    setExportText(JSON.stringify({ name: kit.name, description: kit.description, rules: kit.rules }, null, 2));
    setShowExport(true);
  };

  const doImport = () => {
    const result = importPreset(importText);
    if (result.error || !result.preset) {
      setImportError(result.error ?? 'Could not read that kit.');
      return;
    }
    setImportError('');
    onApplyPreset(importText);
  };

  return (
    <div className="space-y-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div>
        <h3 className="text-xs font-semibold text-zinc-200">Brand kits</h3>
        <p className="text-[11px] text-zinc-500">
          Load a complete, contrast-checked token set, or move your own between profiles.
        </p>
      </div>

      {/* Contrast report (#2) */}
      {issues.length > 0 && (
        <div className="p-2.5 bg-rose-950/40 border border-rose-900 rounded-lg">
          <div className="flex items-center gap-1.5 text-[11px] text-rose-300 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            {issues.length} contrast problem{issues.length > 1 ? 's' : ''}
          </div>
          <ul className="mt-1.5 space-y-1">
            {issues.map((issue) => (
              <li key={issue.label} className="text-[10px] text-rose-200/80 leading-relaxed">
                <span className="font-medium">{issue.label}:</span> {issue.advice}
              </li>
            ))}
          </ul>
        </div>
      )}
      {issues.length === 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
          <Check className="w-3.5 h-3.5" />
          All reading colours meet WCAG AA (4.5:1).
        </div>
      )}

      {/* Presets (#4) */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {BRAND_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onApplyPreset(preset.id)}
            className="text-left p-2.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:border-zinc-600 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: preset.rules.primaryColor }}
              />
              <span className="text-[11px] font-medium text-zinc-200">{preset.name}</span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">{preset.description}</p>
          </button>
        ))}
      </div>

      {/* Import / export (#4) */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={doExport}
          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> Export kit
        </button>
        {showExport && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(exportText);
              setShowExport(false);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px]"
          >
            Copy JSON
          </button>
        )}
      </div>

      {showExport && (
        <textarea
          readOnly
          value={exportText}
          rows={6}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[10px] font-mono text-zinc-300"
        />
      )}

      <div className="space-y-1.5">
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Paste an exported kit here…"
          rows={3}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[10px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
        />
        {importError && <p className="text-[10px] text-rose-400">{importError}</p>}
        <button
          onClick={doImport}
          disabled={!importText.trim()}
          className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-[11px] flex items-center gap-1.5"
        >
          <Upload className="w-3.5 h-3.5" /> Import kit
        </button>
      </div>

      {/* Per-format overrides (#5) */}
      <div className="space-y-2 border-t border-zinc-800 pt-3">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
            Per-format overrides
          </h4>
          <p className="text-[10px] text-zinc-500">
            Clean HTML often suits different table and code treatment than inline CSS.
          </p>
        </div>

        {OUTPUT_FORMATS.map((format) => {
          const patch = overrides[format.id] ?? {};
          const count = Object.keys(patch).length;
          return (
            <details key={format.id} className="bg-zinc-950 border border-zinc-800 rounded-lg">
              <summary className="px-2.5 py-2 text-[11px] text-zinc-300 cursor-pointer flex items-center justify-between">
                <span>{format.label}</span>
                <span className="text-[10px] text-zinc-500">
                  {count > 0 ? `${count} override${count > 1 ? 's' : ''}` : 'inherits profile'}
                </span>
              </summary>
              <div className="px-2.5 pb-2.5 space-y-2">
                {OVERRIDE_TOKENS.map((token) => {
                  const effective = readToken(rules, token);
                  const current = patch[token.key] ?? '';
                  return (
                    <label key={token.key} className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-400 w-24 shrink-0 truncate" title={token.label}>
                        {token.label}
                      </span>
                      <select
                        value={current}
                        onChange={(e) =>
                          onOverrideChange(setFormatOverride(overrides, format.id, token.key, e.target.value))
                        }
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-[10px] text-zinc-200"
                      >
                        <option value="">{`Profile default (${effective})`}</option>
                        {token.kind === 'choice' &&
                          token.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                      </select>
                      {current && (
                        <button
                          onClick={() => onOverrideChange(setFormatOverride(overrides, format.id, token.key, ''))}
                          title="Clear override"
                          className="text-zinc-500 hover:text-rose-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </label>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
};

export { applyPreset };