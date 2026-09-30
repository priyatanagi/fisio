import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: '⌘ + Enter / Ctrl + Enter', desc: 'Generate blog article immediately' },
    { key: '⌘ + K / Ctrl + K', desc: 'Focus topic input field' },
    { key: '⌘ + 1', desc: 'Select Format: Inline CSS (English)' },
    { key: '⌘ + 2', desc: 'Select Format: Inline CSS (Bahasa Indonesia)' },
    { key: '⌘ + 3', desc: 'Select Format: Clean Semantic HTML (English)' },
    { key: '⌘ + 4', desc: 'Select Format: Clean Semantic HTML (Bahasa Indonesia)' },
    { key: '⌘ + Shift + C / Alt + C', desc: 'Quick copy active format HTML' },
    { key: '⌘ + S / Alt + S', desc: 'Export / download active file' },
    { key: '⌘ + Shift + S', desc: 'Download complete 4-format bundle as ZIP' },
    { key: '⌘ + P', desc: 'Configure AI Provider (Gemini / OpenAI / Anthropic)' },
    { key: '⌘ + ,', desc: 'Open Base Strategy & Negative Rules editor' },
    { key: '⌘ + /', desc: 'Open keyboard shortcuts cheat sheet' },
    { key: 'Escape', desc: 'Close open modals or drawers' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-zinc-300" />
            <h3 className="text-sm font-semibold text-zinc-100">Workflow Keyboard Shortcuts</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto divide-y divide-zinc-800/80">
          {shortcuts.map((item, idx) => (
            <div key={idx} className="py-2.5 flex items-center justify-between text-xs gap-3">
              <span className="text-zinc-300">{item.desc}</span>
              <kbd className="px-2 py-1 rounded bg-zinc-950 border border-zinc-800 font-mono text-zinc-300 text-[11px] whitespace-nowrap shadow-xs">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-zinc-950 bg-zinc-100 hover:bg-white rounded-lg transition-colors font-semibold"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
