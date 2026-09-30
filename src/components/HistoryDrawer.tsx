import React from 'react';
import { X, Clock, Trash2, ArrowUpRight, FileText } from 'lucide-react';
import { GeneratedArticle } from '../types/article';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: GeneratedArticle[];
  onSelectArticle: (article: GeneratedArticle) => void;
  onClearHistory: () => void;
  onDeleteItem: (id: string) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onSelectArticle,
  onClearHistory,
  onDeleteItem,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-zinc-900 border-l border-zinc-800 w-full max-w-md h-full flex flex-col shadow-2xl animate-in slide-in-from-right">
        {/* Drawer Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-300" />
            <h3 className="text-sm font-semibold text-zinc-100">Generation History</h3>
            <span className="text-[11px] font-mono text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-800">
              {history.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 text-xs space-y-2">
              <FileText className="w-8 h-8 mx-auto opacity-30" />
              <p>No articles generated yet in this session.</p>
              <p className="text-[11px]">Your generations will automatically be cached here.</p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-lg p-3 transition-all space-y-2 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4
                    onClick={() => {
                      onSelectArticle(item);
                      onClose();
                    }}
                    className="text-xs font-medium text-zinc-200 hover:text-white cursor-pointer line-clamp-2 leading-relaxed"
                  >
                    {item.topic}
                  </h4>
                  <button
                    onClick={() => onDeleteItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-400 p-1 transition-opacity"
                    title="Delete item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-1 border-t border-zinc-900">
                  <div className="flex items-center gap-2">
                    <span className="uppercase font-semibold text-zinc-300">{item.language}</span>
                    <span>•</span>
                    <span>{item.metrics?.wordCount || item.targetWordCount} w</span>
                  </div>
                  <button
                    onClick={() => {
                      onSelectArticle(item);
                      onClose();
                    }}
                    className="flex items-center gap-1 text-zinc-300 hover:text-white"
                  >
                    <span>Load</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Drawer Footer */}
        {history.length > 0 && (
          <div className="p-4 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
            <span className="text-[11px] text-zinc-400 font-mono">Stored in browser cache</span>
            <button
              onClick={onClearHistory}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
