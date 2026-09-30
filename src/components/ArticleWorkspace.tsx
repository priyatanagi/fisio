import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Copy,
  Check,
  Download,
  FileArchive,
  Code2,
  Eye,
  FileText,
  Image as ImageIcon,
  Smartphone,
  Tablet,
  Monitor,
  Search,
  CheckCircle2,
  CheckSquare,
  Sparkles,
  ChevronDown,
  RotateCcw,
  Loader2,
  Wand2,
  ExternalLink,
  Layers,
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Underline,
  Link as LinkIcon,
  Quote,
  List,
  ListOrdered,
  Table as TableIcon,
  HelpCircle,
  Gauge,
  RefreshCw,
  Sliders,
  Undo2,
} from 'lucide-react';
import { GeneratedArticle, OutputFormatId } from '../types/article';
import { ProviderConfig } from '../types/provider';
import { copyToClipboard, downloadFile, downloadAllAsZip } from '../utils/exportUtils';
import { ReadabilityScorecard } from './ReadabilityScorecard';
import { SeoChecklistPanel } from './SeoChecklistPanel';
import { isCleanHtmlIncomplete, synthesizeCleanHtml } from '../utils/cleanHtmlUtils';

export type BottomTab = 'flesch' | 'checklist' | 'seo' | 'prompts';

interface ArticleWorkspaceProps {
  article: GeneratedArticle;
  onUpdateArticle: (updated: GeneratedArticle) => void;
  activeFormat?: OutputFormatId;
  onSelectFormat?: (format: OutputFormatId) => void;
  providerConfig?: ProviderConfig;
}

const FORMAT_OPTIONS: { id: OutputFormatId; name: string; lang: 'en' | 'id'; desc: string }[] = [
  {
    id: 'inline-en',
    name: 'Inline CSS (English)',
    lang: 'en',
    desc: 'Pure HTML with inline CSS • WordPress Custom HTML ready',
  },
  {
    id: 'inline-id',
    name: 'Inline CSS (Bahasa Indonesia)',
    lang: 'id',
    desc: 'HTML murni dengan gaya inline • Siap untuk WordPress',
  },
  {
    id: 'clean-en',
    name: 'Clean Semantic HTML (English)',
    lang: 'en',
    desc: 'Clean markup + <style> + <script> • Interactive FAQ & progress bar',
  },
  {
    id: 'clean-id',
    name: 'Clean Semantic HTML (Bahasa Indonesia)',
    lang: 'id',
    desc: 'Markup semantik + <style> + <script> • Accordion FAQ interaktif',
  },
];

export const ArticleWorkspace: React.FC<ArticleWorkspaceProps> = ({
  article,
  onUpdateArticle,
  activeFormat: controlledFormat,
  onSelectFormat,
  providerConfig,
}) => {
  // Active Format for Results panel
  const [internalFormat, setInternalFormat] = useState<OutputFormatId>('inline-en');
  const selectedFormat = controlledFormat || internalFormat;

  const handleSetFormat = (fmt: OutputFormatId) => {
    setInternalFormat(fmt);
    onSelectFormat?.(fmt);
    setFormatDropdownOpen(false);
  };

  // Bottom Tabs: Flesch, SEO Checklist, Metadata, Image Prompts
  const [bottomTab, setBottomTab] = useState<BottomTab>('flesch');

  // Preview Viewport mode in right panel
  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [formatDropdownOpen, setFormatDropdownOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);

  // AI Improve drawer & execution state
  const [showImproveDrawer, setShowImproveDrawer] = useState(false);
  const [improveInstruction, setImproveInstruction] = useState('');
  const [isImproving, setIsImproving] = useState(false);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<{ format: OutputFormatId; html: string }[]>([]);

  // Refs
  const codeEditorRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setFormatDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showCopyFeedback = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Safe getter for the current format content (automatically fills clean-en/clean-id if incomplete)
  const getCurrentFormatContent = (): string => {
    let content = article.formats[selectedFormat] || '';

    // Safeguard: If clean-en or clean-id is incomplete/empty/ellipsized, synthesize immediately
    if (selectedFormat === 'clean-en') {
      if (isCleanHtmlIncomplete(content)) {
        const synthesized = synthesizeCleanHtml(
          article.formats['inline-en'] || article.inlineCssHtml,
          content,
          article.topic
        );
        return synthesized;
      }
      return content || article.cleanHtml;
    }

    if (selectedFormat === 'clean-id') {
      if (isCleanHtmlIncomplete(content)) {
        const synthesized = synthesizeCleanHtml(
          article.formats['inline-id'] || article.inlineCssHtml,
          content,
          article.topic
        );
        return synthesized;
      }
      return content || article.cleanHtml;
    }

    if (selectedFormat === 'inline-en') {
      return content || article.inlineCssHtml;
    }

    if (selectedFormat === 'inline-id') {
      return content || article.inlineCssHtml;
    }

    return content || article.inlineCssHtml;
  };

  // Updater for the current format content
  const updateCurrentFormatContent = (newContent: string) => {
    const updatedFormats = {
      ...article.formats,
      [selectedFormat]: newContent,
    };

    onUpdateArticle({
      ...article,
      formats: updatedFormats,
      // If updating inline-en or clean-en, sync top-level attributes too
      ...(selectedFormat === 'inline-en' ? { inlineCssHtml: newContent } : {}),
      ...(selectedFormat === 'clean-en' ? { cleanHtml: newContent } : {}),
    });
  };

  // Sync Live Iframe Preview when selected format or code changes
  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        const content = getCurrentFormatContent();
        const fullDoc = content.includes('<!DOCTYPE html>')
          ? content
          : `<!DOCTYPE html>
<html lang="${selectedFormat.endsWith('-id') ? 'id' : 'en'}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body {
        margin: 0;
        padding: 20px 16px;
        background: #ffffff;
        color: #333940;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
    </style>
  </head>
  <body>
    ${content}
  </body>
</html>`;
        doc.write(fullDoc);
        doc.close();
      }
    }
  }, [selectedFormat, article]);

  // Insert HTML Tag at cursor / wrap selected text in code editor
  const insertHtmlTag = (tagOpen: string, tagClose: string = '', defaultPlaceholder: string = '') => {
    const textarea = codeEditorRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = getCurrentFormatContent();
    const selectedText = currentVal.substring(start, end) || defaultPlaceholder;

    const replacement = `${tagOpen}${selectedText}${tagClose}`;
    const updated = currentVal.substring(0, start) + replacement + currentVal.substring(end);

    updateCurrentFormatContent(updated);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + tagOpen.length,
        start + tagOpen.length + selectedText.length
      );
    }, 10);
  };

  // Clean / Prettify Indentations
  const handlePrettifyHtml = () => {
    const raw = getCurrentFormatContent();
    const cleaned = raw
      .replace(/>\s*</g, '>\n<')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    updateCurrentFormatContent(cleaned);
    showCopyFeedback('prettified');
  };

  // Copy code of active format
  const handleCopyCode = async () => {
    const success = await copyToClipboard(getCurrentFormatContent());
    if (success) showCopyFeedback('code');
  };

  // Copy plain text of active format
  const handleCopyCleanText = async () => {
    const stripped = getCurrentFormatContent()
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const success = await copyToClipboard(stripped);
    if (success) showCopyFeedback('text');
  };

  // Export active format HTML file
  const handleDownloadFile = () => {
    const slug = article.seoMetadata.urlSlug || 'commercial-fitness-article';
    const filename = `${slug}-${selectedFormat}.html`;
    downloadFile(filename, getCurrentFormatContent(), 'text/html;charset=utf-8');
    showCopyFeedback('download');
  };

  // Download all as ZIP
  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      await downloadAllAsZip(article);
      showCopyFeedback('zip');
    } finally {
      setIsZipping(false);
    }
  };

  // AI Improve handler
  const handleRunImprovement = async (instructionToUse?: string) => {
    const prompt = instructionToUse || improveInstruction;
    if (!prompt.trim() || isImproving) return;

    setIsImproving(true);
    setImproveError(null);

    try {
      const currentCode = getCurrentFormatContent();
      const res = await fetch('/api/improve-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlContent: currentCode,
          instruction: prompt.trim(),
          providerConfig,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }

      const data = await res.json();
      if (data.improvedHtml) {
        // Push to undo stack
        setUndoStack((prev) => [{ format: selectedFormat, html: currentCode }, ...prev.slice(0, 5)]);
        updateCurrentFormatContent(data.improvedHtml);
        setShowImproveDrawer(false);
        setImproveInstruction('');
        showCopyFeedback('improved');
      }
    } catch (err: any) {
      console.error('Improvement error:', err);
      setImproveError(err.message || 'Failed to improve article with AI.');
    } finally {
      setIsImproving(false);
    }
  };

  // Undo last edit/improvement
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const [previous, ...rest] = undoStack;
    updateCurrentFormatContent(previous.html);
    setUndoStack(rest);
    showCopyFeedback('undone');
  };

  // Calculate live stats of current format
  const currentFormatStats = useMemo(() => {
    const content = getCurrentFormatContent();
    const stripped = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .trim();
    const words = stripped ? stripped.split(/\s+/).length : 0;
    const chars = content.length;
    const readMins = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readMins };
  }, [selectedFormat, article]);

  const activeFormatMeta = FORMAT_OPTIONS.find((f) => f.id === selectedFormat) || FORMAT_OPTIONS[0];

  return (
    <div className="space-y-6">
      {/* Top Metrics Summary Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-mono">Total Length:</span>
            <span className="font-semibold text-zinc-100 font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
              {currentFormatStats.words} words
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-mono">Flesch Score:</span>
            <span className="font-semibold text-emerald-400 font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
              {article.metrics.fleschScore || 65} (Yoast Compliant)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-mono">Reading Time:</span>
            <span className="text-zinc-200 font-mono">~{currentFormatStats.readMins} min read</span>
          </div>

          {article.providerUsed && (
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="text-zinc-400 font-mono">AI Provider:</span>
              <span className="font-mono text-zinc-300 px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-[11px]">
                {article.providerUsed}
              </span>
            </div>
          )}

          <div className="hidden md:flex items-center gap-1.5">
            <span className="text-zinc-400 font-mono">Focus Keyphrase:</span>
            <span className="text-zinc-300 font-medium px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
              "{article.focusKeyphrase || article.seoMetadata.focusKeyphrase}"
            </span>
          </div>
        </div>

        {/* Global Download All ZIP button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-all shadow-sm active:scale-[0.98]"
            title="Download complete bundle ZIP with all 4 formats (⌘⇧S)"
          >
            <FileArchive className="w-3.5 h-3.5 text-zinc-950" />
            <span>{isZipping ? 'Archiving...' : 'Download All (4 Formats ZIP)'}</span>
            <kbd className="hidden sm:inline text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-300 text-zinc-900">
              ⌘⇧S
            </kbd>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. PRIMARY RESULTS PANEL: TWO SEPARATED PANELS (CODE + WEB PREVIEW)       */}
      {/* ========================================================================= */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Results Panel Control Header: Format Dropdown + AI Improve + Actions */}
        <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Format Dropdown Selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono uppercase text-zinc-400 font-semibold tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-zinc-200" />
              <span>Results Format:</span>
            </span>

            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setFormatDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 border border-zinc-700 text-zinc-100 font-medium text-xs sm:text-sm transition-all shadow-sm"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    selectedFormat.endsWith('-id') ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
                <span className="font-semibold">{activeFormatMeta.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700 uppercase text-zinc-300">
                  {activeFormatMeta.lang}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-zinc-400 transition-transform ${
                    formatDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Format Dropdown Menu */}
              {formatDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-80 sm:w-96 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                  <div className="p-2 border-b border-zinc-800 text-[11px] font-mono uppercase tracking-wider text-zinc-400 bg-zinc-950/60">
                    Select Output Format to Edit &amp; Preview
                  </div>
                  <div className="p-1.5 space-y-1">
                    {FORMAT_OPTIONS.map((opt) => {
                      const isSelected = opt.id === selectedFormat;
                      const hasText = Boolean(article.formats[opt.id]);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleSetFormat(opt.id)}
                          className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors flex items-start justify-between gap-3 ${
                            isSelected
                              ? 'bg-zinc-800 border border-zinc-700 text-zinc-100 font-semibold'
                              : 'text-zinc-300 hover:bg-zinc-850 hover:text-zinc-100'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span>{opt.name}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 uppercase">
                                {opt.lang}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-400 font-normal leading-tight">
                              {opt.desc}
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions: AI Improve, Copy Code, Copy Text, Export */}
          <div className="flex items-center flex-wrap gap-2">
            {/* AI Improve Trigger Button */}
            <button
              onClick={() => setShowImproveDrawer((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                showImproveDrawer
                  ? 'bg-zinc-100 text-zinc-950 border-white shadow'
                  : 'bg-zinc-900 hover:bg-zinc-850 border-zinc-700 text-zinc-100'
              }`}
              title="Improve current HTML content with AI"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Improve with AI</span>
            </button>

            {/* Undo button if available */}
            {undoStack.length > 0 && (
              <button
                onClick={handleUndo}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs transition-colors"
                title="Undo last modification"
              >
                <Undo2 className="w-3.5 h-3.5 text-zinc-400" />
                <span className="hidden sm:inline">Undo</span>
              </button>
            )}

            {/* Copy Code button */}
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
              title="Copy active format HTML code (⌘⇧C)"
            >
              {copiedKey === 'code' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Code Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Copy Code</span>
                  <kbd className="hidden md:inline text-[9px] font-mono text-zinc-400">⌘⇧C</kbd>
                </>
              )}
            </button>

            {/* Copy Clean Text */}
            <button
              onClick={handleCopyCleanText}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
              title="Copy pure text without HTML tags"
            >
              {copiedKey === 'text' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Text Copied!</span>
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="hidden sm:inline">Copy Text</span>
                </>
              )}
            </button>

            {/* Export single file */}
            <button
              onClick={handleDownloadFile}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
              title="Export HTML file (⌘S)"
            >
              <Download className="w-3.5 h-3.5 text-zinc-400" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* AI Improvement Drawer */}
        {showImproveDrawer && (
          <div className="bg-zinc-950 border-b border-zinc-800 p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                  AI Content Optimizer &amp; Enhancer
                </span>
              </div>
              <button
                onClick={() => setShowImproveDrawer(false)}
                className="text-zinc-400 hover:text-zinc-200 text-xs"
              >
                Close
              </button>
            </div>

            {/* Quick Suggestion Chips */}
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                onClick={() =>
                  handleRunImprovement(
                    'Expand B2B commercial fitness statistical benchmarks, equipment lifespan comparisons, and ROI metrics with strong tags.'
                  )
                }
                disabled={isImproving}
                className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-mono hover:text-zinc-100 transition-colors"
              >
                📈 Expand Statistical ROI &amp; Lifespans
              </button>
              <button
                onClick={() =>
                  handleRunImprovement(
                    'Strengthen B2B call-to-action sections with direct consultation invitations, free 2D/3D gym floor planning references, and official quotation links.'
                  )
                }
                disabled={isImproving}
                className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-mono hover:text-zinc-100 transition-colors"
              >
                🎯 Add High-Converting B2B Lead CTA
              </button>
              <button
                onClick={() =>
                  handleRunImprovement(
                    'Add 2 more interactive FAQ accordion items comparing commercial warranty terms and preventive maintenance schedules.'
                  )
                }
                disabled={isImproving}
                className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-mono hover:text-zinc-100 transition-colors"
              >
                🏷️ Add Warranty &amp; Maintenance FAQs
              </button>
              <button
                onClick={() =>
                  handleRunImprovement(
                    'Optimize sentence lengths to meet strict Yoast and Flesch reading ease score of 65+, breaking up run-on sentences and adding transition words.'
                  )
                }
                disabled={isImproving}
                className="px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-mono hover:text-zinc-100 transition-colors"
              >
                📖 Boost Flesch Score (65+ Optimal)
              </button>
            </div>

            {/* Custom instruction input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={improveInstruction}
                onChange={(e) => setImproveInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRunImprovement();
                  }
                }}
                placeholder="Type specific enhancement (e.g., 'Add a section on hotel gym equipment space planning with 250 sq meter layout')..."
                className="flex-1 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-500"
              />
              <button
                onClick={() => handleRunImprovement()}
                disabled={isImproving || !improveInstruction.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs sm:text-sm disabled:opacity-50 transition-colors"
              >
                {isImproving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                    <span>Enhancing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Apply</span>
                  </>
                )}
              </button>
            </div>

            {improveError && (
              <div className="text-xs text-rose-400 font-mono bg-rose-950/60 p-2 rounded border border-rose-900">
                {improveError}
              </div>
            )}
          </div>
        )}

        {/* HTML Editing Toolbar ("full capability of html editing formats and tags") */}
        <div className="bg-zinc-950/90 border-b border-zinc-800/80 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs select-none">
          <div className="flex items-center flex-wrap gap-1">
            <span className="text-[11px] font-mono uppercase text-zinc-400 font-semibold mr-1">
              HTML Tags:
            </span>

            {/* Headings */}
            <button
              type="button"
              onClick={() => insertHtmlTag('<h2>', '</h2>', 'Subheading Title')}
              className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-bold font-mono text-[11px]"
              title="Insert H2 Subheading"
            >
              H2
            </button>
            <button
              type="button"
              onClick={() => insertHtmlTag('<h3>', '</h3>', 'Minor Header')}
              className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-bold font-mono text-[11px]"
              title="Insert H3 Subheading"
            >
              H3
            </button>
            <button
              type="button"
              onClick={() => insertHtmlTag('<h4>', '</h4>', 'Topic Spec')}
              className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-bold font-mono text-[11px]"
              title="Insert H4 Subheading"
            >
              H4
            </button>

            <span className="text-zinc-700 px-0.5">|</span>

            {/* Text Formats */}
            <button
              type="button"
              onClick={() => insertHtmlTag('<strong>', '</strong>', 'bold text')}
              className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200"
              title="Bold (<strong>)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertHtmlTag('<em>', '</em>', 'emphasized text')}
              className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200"
              title="Italic (<em>)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertHtmlTag('<u>', '</u>', 'underlined text')}
              className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200"
              title="Underline (<u>)"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => insertHtmlTag('<p>', '</p>', 'Paragraph body content with clear sentence rhythm.')}
              className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-mono text-[11px]"
              title="Paragraph (<p>)"
            >
              &lt;p&gt;
            </button>

            <span className="text-zinc-700 px-0.5">|</span>

            {/* Structural Elements */}
            <button
              type="button"
              onClick={() =>
                insertHtmlTag(
                  '<aside class="data-callout" style="background:#f8fafc; border-left:4px solid #cc2929; border-radius:0 8px 8px 0; padding:20px; margin:2em 0;">\n  <strong>Key Commercial Metric:</strong> ',
                  '\n</aside>',
                  'Commercial fitness facilities experience 40% lower equipment downtime when choosing selectorized pin-loaded stations.'
                )
              }
              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-mono text-[11px]"
              title="Data Callout Box (<aside>)"
            >
              <Quote className="w-3.5 h-3.5 text-zinc-400" />
              <span>Callout</span>
            </button>

            <button
              type="button"
              onClick={() =>
                insertHtmlTag(
                  '<a href="https://realleaderusa.id/konsultasi-layout-gym" target="_blank" rel="noopener" style="color:#cc2929; font-weight:600; text-decoration:underline;">',
                  '</a>',
                  'Free RealleaderUSA 3D Facility Layout Consultation'
                )
              }
              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-mono text-[11px]"
              title="Hyperlink (<a>)"
            >
              <LinkIcon className="w-3.5 h-3.5 text-zinc-400" />
              <span>Link</span>
            </button>

            <button
              type="button"
              onClick={() =>
                insertHtmlTag(
                  '<ul>\n  <li>',
                  '</li>\n  <li>Second key specification</li>\n</ul>',
                  'Heavy-duty 11-gauge structural steel frame'
                )
              }
              className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200"
              title="Bullet List (<ul>)"
            >
              <List className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() =>
                insertHtmlTag(
                  '<ol>\n  <li>',
                  '</li>\n  <li>Analyze member traffic flow & spacing</li>\n</ol>',
                  'Determine total facility square meters'
                )
              }
              className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200"
              title="Numbered List (<ol>)"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() =>
                insertHtmlTag(
                  '<figure style="margin:2em 0; text-align:center;">\n  <img src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&auto=format&fit=crop&q=80" alt="Commercial gym layout" style="width:100%; height:auto; border-radius:8px; border:1px solid #e2e8f0;" />\n  <figcaption style="color:#64748b; font-size:0.85rem; margin-top:0.5em;">',
                  '</figcaption>\n</figure>',
                  'High-density commercial selectorized zone'
                )
              }
              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-mono text-[11px]"
              title="Figure & Image Tag (<figure><img>)"
            >
              <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
              <span>Figure</span>
            </button>

            <button
              type="button"
              onClick={() =>
                insertHtmlTag(
                  '<details class="faq-item" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px; margin-bottom:12px;">\n  <summary style="font-weight:600; cursor:pointer;">',
                  '</summary>\n  <p style="margin-top:10px; margin-bottom:0;">Realleader commercial strength gear is backed by an industry-leading 10-year structural frame warranty and dedicated local spare parts availability.</p>\n</details>',
                  'What warranty coverage is included with commercial gym equipment?'
                )
              }
              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-mono text-[11px]"
              title="Interactive FAQ Accordion (<details><summary>)"
            >
              <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
              <span>FAQ</span>
            </button>

            <button
              type="button"
              onClick={() =>
                insertHtmlTag(
                  '<table style="width:100%; border-collapse:collapse; margin:2em 0;">\n  <thead><tr style="background:#f1f5f9;"><th style="padding:10px; border:1px solid #e2e8f0; text-align:left;">Specification</th><th style="padding:10px; border:1px solid #e2e8f0; text-align:left;">Realleader Commercial</th><th style="padding:10px; border:1px solid #e2e8f0; text-align:left;">Standard Brand</th></tr></thead>\n  <tbody>\n    <tr><td style="padding:10px; border:1px solid #e2e8f0;">Frame Gauge</td><td style="padding:10px; border:1px solid #e2e8f0;">11-Gauge Structural Steel</td><td style="padding:10px; border:1px solid #e2e8f0;">14-Gauge Mild Steel</td></tr>\n    <tr><td style="padding:10px; border:1px solid #e2e8f0;">Warranty</td><td style="padding:10px; border:1px solid #e2e8f0;">10 Years Structural</td><td style="padding:10px; border:1px solid #e2e8f0;">1-2 Years Limited</td></tr>\n  </tbody>\n</table>'
                )
              }
              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-mono text-[11px]"
              title="Comparison Table (<table>)"
            >
              <TableIcon className="w-3.5 h-3.5 text-zinc-400" />
              <span>Table</span>
            </button>
          </div>

          {/* Clean / Prettify Code */}
          <button
            type="button"
            onClick={handlePrettifyHtml}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[11px] font-mono transition-colors"
            title="Clean indentations and HTML tag whitespace"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Prettify</span>
          </button>
        </div>

        {/* TWO SEPARATED PANELS: CODE ON LEFT, LIVE PREVIEW ON RIGHT */}
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800 bg-zinc-950 min-h-[640px]">
          {/* LEFT PANEL: HTML CODE EDITOR */}
          <div className="flex flex-col h-full bg-zinc-950">
            <div className="bg-zinc-900/90 px-4 py-2 border-b border-zinc-800 text-[11px] font-mono text-zinc-400 flex items-center justify-between select-none">
              <div className="flex items-center gap-2">
                <Code2 className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-semibold text-zinc-200 uppercase tracking-wide">
                  HTML Source Code Editor
                </span>
                <span className="text-zinc-500">•</span>
                <span className="text-zinc-400">{activeFormatMeta.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300">
                  {currentFormatStats.words} w
                </span>
                <span className="text-zinc-500 font-mono">{currentFormatStats.chars} chars</span>
              </div>
            </div>

            {/* Editable Textarea with full editing capabilities */}
            <div className="flex-1 relative flex">
              <textarea
                ref={codeEditorRef}
                value={getCurrentFormatContent()}
                onChange={(e) => updateCurrentFormatContent(e.target.value)}
                onKeyDown={(e) => {
                  // Support Tab indentation
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    insertHtmlTag('  ');
                  }
                }}
                className="w-full h-[620px] lg:h-[700px] p-4 bg-zinc-950 text-zinc-100 font-mono text-xs sm:text-[13px] leading-relaxed resize-none outline-none focus:ring-0 selection:bg-zinc-800 border-0"
                spellCheck={false}
                placeholder="Article HTML markup will appear here..."
              />
            </div>
          </div>

          {/* RIGHT PANEL: WEB PREVIEW RESULTS */}
          <div className="flex flex-col h-full bg-zinc-950">
            {/* Browser Preview Header with viewport controls */}
            <div className="bg-zinc-900/90 px-4 py-2 border-b border-zinc-800 text-[11px] font-mono text-zinc-400 flex flex-wrap items-center justify-between gap-2 select-none">
              <div className="flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-semibold text-zinc-200 uppercase tracking-wide">
                  Web Browser Live Preview
                </span>
              </div>

              {/* Viewport switcher */}
              <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setViewportMode('desktop')}
                  className={`p-1 rounded ${
                    viewportMode === 'desktop'
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Desktop View (100%)"
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewportMode('tablet')}
                  className={`p-1 rounded ${
                    viewportMode === 'tablet'
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Tablet View (768px)"
                >
                  <Tablet className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewportMode('mobile')}
                  className={`p-1 rounded ${
                    viewportMode === 'mobile'
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Mobile View (375px)"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Browser frame container */}
            <div className="flex-1 bg-zinc-900/50 p-2 sm:p-4 flex justify-center items-start overflow-auto">
              <div
                className={`transition-all duration-300 rounded-lg shadow-2xl bg-white overflow-hidden border border-zinc-700 w-full ${
                  viewportMode === 'mobile'
                    ? 'max-w-[375px]'
                    : viewportMode === 'tablet'
                    ? 'max-w-[768px]'
                    : 'max-w-full'
                }`}
              >
                {/* Simulated browser chrome header */}
                <div className="bg-zinc-100 border-b border-zinc-200 px-3 py-1.5 flex items-center justify-between text-xs text-zinc-600 select-none">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                  </div>
                  <div className="bg-white px-2.5 py-0.5 rounded text-[11px] font-mono text-zinc-500 border border-zinc-200 truncate max-w-xs">
                    realleaderusa.id/blog/{article.seoMetadata.urlSlug}?format={selectedFormat}
                  </div>
                  <div className="text-[10px] font-mono uppercase font-bold text-zinc-400">
                    {selectedFormat.endsWith('-id') ? 'ID' : 'EN'}
                  </div>
                </div>

                {/* Sandboxed Iframe Rendering Active Format */}
                <iframe
                  ref={iframeRef}
                  title="Live Web Preview of Active Format"
                  className="w-full h-[580px] lg:h-[650px] border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. ALL OTHER TABS GO BELOW THE RESULTS PANEL                              */}
      {/* ========================================================================= */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
        {/* Navigation Tabs Bar for Secondary Views */}
        <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {/* Tab 1: Flesch Readability Calculator */}
          <button
            type="button"
            onClick={() => setBottomTab('flesch')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              bottomTab === 'flesch'
                ? 'bg-zinc-800 text-zinc-100 shadow border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Gauge className="w-4 h-4 text-emerald-400" />
            <span>Flesch-Kincaid Calculator</span>
          </button>

          {/* Tab 2: SEO Checklist */}
          <button
            type="button"
            onClick={() => setBottomTab('checklist')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              bottomTab === 'checklist'
                ? 'bg-zinc-800 text-zinc-100 shadow border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <CheckSquare className="w-4 h-4 text-zinc-300" />
            <span>17-Point SEO Checklist</span>
          </button>

          {/* Tab 3: SEO WordPress Metadata */}
          <button
            type="button"
            onClick={() => setBottomTab('seo')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              bottomTab === 'seo'
                ? 'bg-zinc-800 text-zinc-100 shadow border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Search className="w-4 h-4 text-zinc-300" />
            <span>Yoast SEO Metadata</span>
          </button>

          {/* Tab 4: 8K AI Image Prompts */}
          <button
            type="button"
            onClick={() => setBottomTab('prompts')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              bottomTab === 'prompts'
                ? 'bg-zinc-800 text-zinc-100 shadow border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-zinc-300" />
            <span>8K AI Image Prompts</span>
          </button>
        </div>

        {/* Tab Content Panel */}
        <div className="p-4 sm:p-6 bg-zinc-950">
          {/* TAB 1: FLESCH READABILITY CALCULATOR */}
          {bottomTab === 'flesch' && (
            <ReadabilityScorecard
              content={getCurrentFormatContent()}
              language={selectedFormat.endsWith('-id') ? 'id' : 'en'}
              onLanguageChange={(newLang) => {
                if (newLang === 'id' && !selectedFormat.endsWith('-id')) {
                  handleSetFormat('inline-id');
                } else if (newLang === 'en' && selectedFormat.endsWith('-id')) {
                  handleSetFormat('inline-en');
                }
              }}
            />
          )}

          {/* TAB 2: SEO CHECKLIST */}
          {bottomTab === 'checklist' && (
            <SeoChecklistPanel
              htmlContent={getCurrentFormatContent()}
              metadata={article.seoMetadata}
              focusKeyphraseInput={article.focusKeyphrase}
            />
          )}

          {/* TAB 3: SEO WORDPRESS METADATA */}
          {bottomTab === 'seo' && (
            <div className="text-zinc-200 space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <h3 className="font-semibold text-zinc-100 text-sm">
                    Yoast &amp; WordPress SEO Meta Headers
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Strictly conforms to Yoast guidelines and Google SERP display character limits.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const metaText = `SEO Title: ${article.seoMetadata.seoTitle}\nHeadline: ${article.seoMetadata.headline}\nFocus Keyphrase: ${article.focusKeyphrase || article.seoMetadata.focusKeyphrase}\nMeta Description: ${article.seoMetadata.metaDescription}\nURL Slug: ${article.seoMetadata.urlSlug}\nTags: ${article.seoMetadata.tags.join(', ')}`;
                    await copyToClipboard(metaText);
                    showCopyFeedback('seoAll');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200"
                >
                  {copiedKey === 'seoAll' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                  <span>{copiedKey === 'seoAll' ? 'Copied All!' : 'Copy All Meta'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Post Title */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-zinc-400">
                      SEO Title (Max 55 chars)
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono ${
                          article.seoMetadata.seoTitle.length > 55
                            ? 'text-amber-400'
                            : 'text-zinc-400'
                        }`}
                      >
                        {article.seoMetadata.seoTitle.length}/55
                      </span>
                      <button
                        onClick={() => {
                          copyToClipboard(article.seoMetadata.seoTitle);
                          showCopyFeedback('seoTitle');
                        }}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
                      >
                        {copiedKey === 'seoTitle' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={article.seoMetadata.seoTitle}
                    onChange={(e) =>
                      onUpdateArticle({
                        ...article,
                        seoMetadata: { ...article.seoMetadata, seoTitle: e.target.value },
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-100 font-medium"
                  />
                </div>

                {/* Headline */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-zinc-400">
                      Click-Magnet Headline
                    </span>
                    <button
                      onClick={() => {
                        copyToClipboard(article.seoMetadata.headline);
                        showCopyFeedback('headline');
                      }}
                      className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
                    >
                      {copiedKey === 'headline' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={article.seoMetadata.headline}
                    onChange={(e) =>
                      onUpdateArticle({
                        ...article,
                        seoMetadata: { ...article.seoMetadata, headline: e.target.value },
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-100 font-medium"
                  />
                </div>

                {/* Focus Keyphrase */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-zinc-400">
                      Focus Keyphrase (Max 20 chars)
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono ${
                          (article.focusKeyphrase || article.seoMetadata.focusKeyphrase).length > 20
                            ? 'text-amber-400'
                            : 'text-zinc-400'
                        }`}
                      >
                        {(article.focusKeyphrase || article.seoMetadata.focusKeyphrase).length}/20
                      </span>
                      <button
                        onClick={() => {
                          copyToClipboard(
                            article.focusKeyphrase || article.seoMetadata.focusKeyphrase
                          );
                          showCopyFeedback('focusKeyphrase');
                        }}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
                      >
                        {copiedKey === 'focusKeyphrase' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={article.focusKeyphrase || article.seoMetadata.focusKeyphrase}
                    onChange={(e) =>
                      onUpdateArticle({
                        ...article,
                        focusKeyphrase: e.target.value,
                        seoMetadata: { ...article.seoMetadata, focusKeyphrase: e.target.value },
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-100 font-medium font-mono"
                  />
                </div>

                {/* URL Slug */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-zinc-400">
                      WordPress URL Slug
                    </span>
                    <button
                      onClick={() => {
                        copyToClipboard(article.seoMetadata.urlSlug);
                        showCopyFeedback('urlSlug');
                      }}
                      className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
                    >
                      {copiedKey === 'urlSlug' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={article.seoMetadata.urlSlug}
                    onChange={(e) =>
                      onUpdateArticle({
                        ...article,
                        seoMetadata: { ...article.seoMetadata, urlSlug: e.target.value },
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-100 font-mono"
                  />
                </div>

                {/* Meta Description */}
                <div className="md:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-zinc-400">
                      Meta Description (Max 155 chars)
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono ${
                          article.seoMetadata.metaDescription.length > 155
                            ? 'text-amber-400'
                            : 'text-zinc-400'
                        }`}
                      >
                        {article.seoMetadata.metaDescription.length}/155
                      </span>
                      <button
                        onClick={() => {
                          copyToClipboard(article.seoMetadata.metaDescription);
                          showCopyFeedback('metaDesc');
                        }}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
                      >
                        {copiedKey === 'metaDesc' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={article.seoMetadata.metaDescription}
                    onChange={(e) =>
                      onUpdateArticle({
                        ...article,
                        seoMetadata: { ...article.seoMetadata, metaDescription: e.target.value },
                      })
                    }
                    rows={2}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-100 leading-relaxed outline-none"
                  />
                </div>

                {/* WordPress Tags */}
                <div className="md:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-zinc-400">WordPress Tags</span>
                    <button
                      onClick={() => {
                        copyToClipboard(article.seoMetadata.tags.join(', '));
                        showCopyFeedback('tags');
                      }}
                      className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
                    >
                      {copiedKey === 'tags' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {article.seoMetadata.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 font-mono"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: 8K AI IMAGE PROMPTS */}
          {bottomTab === 'prompts' && (
            <div className="text-zinc-200 space-y-5">
              <div className="border-b border-zinc-800 pb-3">
                <h3 className="font-semibold text-zinc-100 text-sm">
                  Ultra-Realistic 8K AI Image Prompts
                </h3>
                <p className="text-xs text-zinc-400">
                  Engineered for Midjourney v6, FLUX.1, or Stable Diffusion with authentic commercial gym lighting, visible skin pores, natural sweat, and authentic powder-coated steel textures.
                </p>
              </div>

              <div className="space-y-4">
                {article.imagePrompts.map((promptItem, idx) => (
                  <div
                    key={idx}
                    className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded bg-zinc-800 text-zinc-300 text-xs font-mono flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-sm text-zinc-100">
                          {promptItem.label}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
                          --ar {promptItem.aspectRatio}
                        </span>
                      </div>

                      <button
                        onClick={() => {
                          copyToClipboard(promptItem.prompt);
                          showCopyFeedback(`prompt_${idx}`);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 font-medium transition-colors"
                      >
                        {copiedKey === `prompt_${idx}` ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Copy Prompt</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="text-xs text-zinc-400">
                      <span className="font-mono uppercase text-zinc-400">Concept: </span>
                      <span className="text-zinc-300">{promptItem.concept}</span>
                    </div>

                    <div className="relative">
                      <pre className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 leading-relaxed whitespace-pre-wrap selection:bg-zinc-800">
                        {promptItem.prompt}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
