import React, { useRef, useEffect, useState } from 'react';
import {
  Sparkles,
  AlignLeft,
  Loader2,
  Bookmark,
  ChevronDown,
  MapPin,
  Key,
  Layers,
  CheckSquare,
  Square,
  Tag,
} from 'lucide-react';
import { LengthTarget, OutputFormatId } from '../types/article';
import {
  LENGTH_PRESETS,
  RESEARCH_KEYWORD_SEGMENTS,
} from '../config/defaultPrompts';

interface TopicConsoleProps {
  topic: string;
  setTopic: (t: string) => void;
  focusKeyphrase: string;
  setFocusKeyphrase: (fk: string) => void;
  secondaryKeywords: string;
  setSecondaryKeywords: (sk: string) => void;
  targetFormats: OutputFormatId[];
  setTargetFormats: (formats: OutputFormatId[]) => void;
  lengthTarget: LengthTarget;
  setLengthTarget: (lt: LengthTarget) => void;
  customWordCount: number;
  setCustomWordCount: (c: number) => void;
  isGenerating: boolean;
  onGenerate: () => void;
}

export const TopicConsole: React.FC<TopicConsoleProps> = ({
  topic,
  setTopic,
  focusKeyphrase,
  setFocusKeyphrase,
  secondaryKeywords,
  setSecondaryKeywords,
  targetFormats,
  setTargetFormats,
  lengthTarget,
  setLengthTarget,
  customWordCount,
  setCustomWordCount,
  isGenerating,
  onGenerate,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showKeywordDrawer, setShowKeywordDrawer] = useState<boolean>(false);
  const [selectedSegment, setSelectedSegment] = useState<string>('supplier_paket');
  const [showAdvancedKeywords, setShowAdvancedKeywords] = useState<boolean>(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (topic.trim() && !isGenerating) {
        onGenerate();
      }
    }
  };

  const handleSelectKeyword = (kw: string) => {
    setTopic(kw);
    // Auto-suggest focus keyphrase from the keyword
    if (!focusKeyphrase) {
      const words = kw.split(/\s+/).slice(0, 3).join(' ');
      setFocusKeyphrase(words);
    }
    setShowKeywordDrawer(false);
    inputRef.current?.focus();
  };

  const toggleFormat = (formatId: OutputFormatId) => {
    if (targetFormats.includes(formatId)) {
      if (targetFormats.length > 1) {
        setTargetFormats(targetFormats.filter((f) => f !== formatId));
      }
    } else {
      setTargetFormats([...targetFormats, formatId]);
    }
  };

  const selectAllFormats = () => {
    setTargetFormats(['inline-en', 'inline-id', 'clean-en', 'clean-id']);
  };

  const activeSegmentData = RESEARCH_KEYWORD_SEGMENTS.find((s) => s.id === selectedSegment);

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-6 backdrop-blur-sm shadow-xl space-y-4">
      {/* Primary Input Field */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="topic-input" className="font-medium text-zinc-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300"></span>
            Article Topic or Keyword
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowKeywordDrawer(!showKeywordDrawer)}
              className="text-zinc-300 hover:text-white font-mono text-[11px] flex items-center gap-1 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              <Bookmark className="w-3 h-3 text-zinc-400" />
              <span>Keyword Research Library (Doc)</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showKeywordDrawer ? 'rotate-180' : ''}`} />
            </button>
            <span className="text-zinc-400 font-mono text-[11px] hidden sm:inline">
              <kbd className="px-1 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">⌘K</kbd> to focus
            </span>
          </div>
        </div>

        <div className="relative flex items-center">
          <input
            id="topic-input"
            ref={inputRef}
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            placeholder="e.g. Commercial Gym ROI: Selectorized vs Plate-Loaded Strength Equipment..."
            className="w-full bg-zinc-950 border border-zinc-700/80 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-300 text-zinc-100 placeholder-zinc-400 text-sm sm:text-base rounded-lg py-3 px-4 pr-10 outline-none transition-all"
          />
          {topic && !isGenerating && (
            <button
              onClick={() => {
                setTopic('');
                inputRef.current?.focus();
              }}
              className="absolute right-3 text-zinc-400 hover:text-zinc-200 text-xs px-1.5 py-0.5 rounded"
              title="Clear input"
            >
              ✕
            </button>
          )}
        </div>

        {/* Expandable Keyword Research Library (From the PDF document) */}
        {showKeywordDrawer && (
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3 animate-in fade-in">
            {/* Segment Selector Tabs */}
            <div className="flex flex-wrap gap-1 border-b border-zinc-800/80 pb-2">
              {RESEARCH_KEYWORD_SEGMENTS.map((seg) => (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => setSelectedSegment(seg.id)}
                  className={`text-[11px] px-2.5 py-1 rounded font-medium transition-all ${
                    selectedSegment === seg.id
                      ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  {seg.name}
                </button>
              ))}
            </div>

            {/* Keyword Pills for Active Segment */}
            {activeSegmentData && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-zinc-400 font-mono">
                  {activeSegmentData.description}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {activeSegmentData.keywords.map((kw, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectKeyword(kw.title)}
                      className="text-xs text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md px-2.5 py-1 transition-colors flex items-center gap-1.5 group"
                    >
                      <span>{kw.title}</span>
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-950 text-zinc-400 uppercase">
                        {kw.targetLang}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Geographic Variations from Document */}
            <div className="pt-2 border-t border-zinc-900 flex items-center gap-2 text-[11px] text-zinc-400 flex-wrap">
              <span className="flex items-center gap-1 text-zinc-300">
                <MapPin className="w-3 h-3 text-zinc-400" />
                Variasi Lokasi Sasaran:
              </span>
              {['Bali (Hotel/Villa)', 'Jakarta (Komersial)', 'Medan', 'Balikpapan', 'Surabaya'].map(
                (loc, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      const newTopic = topic
                        ? `${topic} di ${loc.split(' ')[0]}`
                        : `Supplier Alat Fitness ${loc}`;
                      setTopic(newTopic);
                      setShowKeywordDrawer(false);
                    }}
                    className="text-[10px] text-zinc-400 hover:text-zinc-200 underline decoration-zinc-700 hover:decoration-zinc-300"
                  >
                    +{loc}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Additional Keyphrase & Secondary Keywords Form */}
      <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setShowAdvancedKeywords(!showAdvancedKeywords)}
            className="text-zinc-300 hover:text-white font-medium flex items-center gap-1.5"
          >
            <Key className="w-3.5 h-3.5 text-zinc-400" />
            <span>Focus Keyphrase & Secondary Keywords (Optional)</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedKeywords ? 'rotate-180' : ''}`} />
          </button>
          <span className="text-[11px] text-zinc-400 font-mono">
            {focusKeyphrase ? `Keyphrase: "${focusKeyphrase}"` : 'Auto-extracted if left empty'}
          </span>
        </div>

        {showAdvancedKeywords && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-in fade-in">
            {/* Primary Focus Keyphrase */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                <span>Focus Keyphrase (Max 30 chars)</span>
                <span className={focusKeyphrase.length > 30 ? 'text-amber-400' : 'text-zinc-500'}>
                  {focusKeyphrase.length}/30
                </span>
              </label>
              <input
                type="text"
                value={focusKeyphrase}
                onChange={(e) => setFocusKeyphrase(e.target.value)}
                disabled={isGenerating}
                placeholder="e.g. gym equipment ROI"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-500 rounded p-2 text-xs text-zinc-100 font-mono outline-none"
              />
            </div>

            {/* Secondary Keywords / Tags */}
            <div className="space-y-1">
              <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <Tag className="w-3 h-3 text-zinc-500" />
                <span>Secondary Keywords / LSI Terms</span>
              </label>
              <input
                type="text"
                value={secondaryKeywords}
                onChange={(e) => setSecondaryKeywords(e.target.value)}
                disabled={isGenerating}
                placeholder="e.g. selectorized, plate-loaded, commercial fitness"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-500 rounded p-2 text-xs text-zinc-100 font-mono outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Output Formats Multi-Select: Four Formats (inline-en, inline-id, clean-en, clean-id) */}
      <div className="bg-zinc-950/90 border border-zinc-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-medium text-zinc-300">
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span>Target Output Formats (Total 4 Formats)</span>
          </div>
          <button
            type="button"
            onClick={selectAllFormats}
            disabled={isGenerating}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 underline font-mono"
          >
            Select All 4 Formats
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { id: 'inline-en' as OutputFormatId, label: 'Inline CSS (EN)', desc: 'Mode 1 English' },
            { id: 'inline-id' as OutputFormatId, label: 'Inline CSS (ID)', desc: 'Mode 1 Indonesia' },
            { id: 'clean-en' as OutputFormatId, label: 'Clean HTML (EN)', desc: 'Mode 2 English' },
            { id: 'clean-id' as OutputFormatId, label: 'Clean HTML (ID)', desc: 'Mode 2 Indonesia' },
          ].map((fmt) => {
            const isSelected = targetFormats.includes(fmt.id);
            return (
              <button
                key={fmt.id}
                type="button"
                onClick={() => toggleFormat(fmt.id)}
                disabled={isGenerating}
                className={`p-2 rounded-lg border text-left transition-all flex items-start gap-2 ${
                  isSelected
                    ? 'bg-zinc-900 border-zinc-200 text-zinc-100'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                {isSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-zinc-100 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="text-xs font-semibold block">{fmt.label}</span>
                  <span className="text-[10px] text-zinc-400 font-mono block">{fmt.desc}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Control Strip: Content Length & Action Button */}
      <div className="pt-2 border-t border-zinc-800/80 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Content Length Targets */}
        <div className="space-y-1.5 flex-1 min-w-[280px]">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <AlignLeft className="w-3 h-3 text-zinc-400" />
              Target Word Count
            </span>
            <span className="text-zinc-300 font-mono">
              {lengthTarget === 'custom'
                ? `${customWordCount} words`
                : LENGTH_PRESETS.find((p) => p.id === lengthTarget)?.range}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1 p-0.5 bg-zinc-950 border border-zinc-800 rounded-lg text-center">
            {LENGTH_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setLengthTarget(preset.id as LengthTarget)}
                disabled={isGenerating}
                className={`py-1.5 px-2 text-xs rounded-md transition-all font-medium ${
                  lengthTarget === preset.id
                    ? 'bg-zinc-100 text-zinc-950 shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
                title={preset.desc}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {lengthTarget === 'custom' && (
            <div className="pt-2 flex items-center gap-3">
              <input
                type="range"
                min="500"
                max="2500"
                step="50"
                value={customWordCount}
                onChange={(e) => setCustomWordCount(Number(e.target.value))}
                disabled={isGenerating}
                className="w-full accent-zinc-200 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
              />
              <span className="text-xs font-mono text-zinc-300 w-16 text-right">
                {customWordCount} w
              </span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex items-end pt-2 lg:pt-0">
          <button
            type="button"
            onClick={onGenerate}
            disabled={!topic.trim() || isGenerating || targetFormats.length === 0}
            className={`w-full lg:w-auto min-w-[220px] flex items-center justify-center gap-2.5 py-3 px-6 rounded-lg font-medium text-sm transition-all ${
              !topic.trim() || isGenerating || targetFormats.length === 0
                ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed border border-zinc-700/50'
                : 'bg-zinc-100 text-zinc-950 hover:bg-white active:scale-[0.99] border border-white shadow-lg shadow-zinc-950/50 cursor-pointer font-semibold'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                <span>Architecting ({targetFormats.length} Formats)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-zinc-950" />
                <span>Generate ({targetFormats.length} Formats)</span>
                <kbd className="hidden sm:inline-block ml-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-800 border border-zinc-300">
                  ⌘↵
                </kbd>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
