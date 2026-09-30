import React, { useState } from 'react';
import { X, RotateCcw, Check, ShieldAlert, BookOpen } from 'lucide-react';
import { DEFAULT_BASE_SYSTEM_PROMPT, DEFAULT_NEGATIVE_PROMPT } from '../config/defaultPrompts';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt: string;
  setSystemPrompt: (p: string) => void;
  negativePrompt: string;
  setNegativePrompt: (np: string) => void;
  onReset: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({
  isOpen,
  onClose,
  systemPrompt,
  setSystemPrompt,
  negativePrompt,
  setNegativePrompt,
  onReset,
}) => {
  const [activeTab, setActiveTab] = useState<'system' | 'negative'>('system');
  const [savedFeedback, setSavedFeedback] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem('fitseo_system_prompt', systemPrompt);
    localStorage.setItem('fitseo_negative_prompt', negativePrompt);
    setSavedFeedback(true);
    setTimeout(() => {
      setSavedFeedback(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div>
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-zinc-300" />
              SEO Content Strategy & Negative Prompt Engine
            </h2>
            <p className="text-xs text-zinc-400">
              Customize the base system rules, Yoast & Flesch readability constraints, and negative filters.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="px-6 pt-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('system')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-all ${
                activeTab === 'system'
                  ? 'border-zinc-100 text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Base System Strategy Prompt
            </button>
            <button
              onClick={() => setActiveTab('negative')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === 'negative'
                  ? 'border-zinc-100 text-zinc-100'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Negative Prompt & Restrictions
            </button>
          </div>

          <button
            onClick={onReset}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 px-2.5 py-1 rounded transition-colors"
            title="Reset to original Commercial Fitness guidelines"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Defaults</span>
          </button>
        </div>

        {/* Editor Body */}
        <div className="flex-1 p-6 overflow-y-auto bg-zinc-950 font-mono text-xs">
          {activeTab === 'system' ? (
            <div className="space-y-2">
              <label className="text-[11px] text-zinc-400 uppercase tracking-wider block">
                Base System Instructions (Yoast, Flesch 60-70, Realleader Palette & Schema rules)
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={20}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-zinc-200 leading-relaxed outline-none focus:border-zinc-600 resize-none selection:bg-zinc-800"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-[11px] text-zinc-400 uppercase tracking-wider block">
                Negative Rules (No H1 tags in HTML, No script tags in Mode 1, No emojis, No standalone 1-sentence paragraphs)
              </label>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                rows={16}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-zinc-200 leading-relaxed outline-none focus:border-zinc-600 resize-none selection:bg-zinc-800"
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
          <span className="text-xs text-zinc-400 font-mono">
            Modifications will be applied to all future generations
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg transition-all font-semibold shadow-sm"
            >
              {savedFeedback ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save Strategy</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
