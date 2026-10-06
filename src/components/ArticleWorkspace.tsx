import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  AlertCircle,
  Lock,
  History,
} from 'lucide-react';
import { GeneratedArticle, OutputFormatId, SeoMetadata } from '../types/article';
import type { UserProfile } from '../types/profile';
import type { MultiAgentConfig } from '../types/provider';
import { copyToClipboard, downloadFile, downloadAllAsZip } from '../utils/exportUtils';
import { ReadabilityScorecard } from './ReadabilityScorecard';
import { SeoChecklistPanel } from './SeoChecklistPanel';
import { isCleanHtmlIncomplete, synthesizeCleanHtml } from '../utils/cleanHtmlUtils';
import { improveArticle } from '../pipeline/improveArticle';
import { normalizeRenderedHtml } from '../utils/articleShell';
import { scoreHtml } from '../pipeline/scoreHtml';
import {
  appendMetadataVersion,
  formatVersionStamp,
  metadataDiff,
  restoreMetadataVersion,
  versionsFor,
} from '../utils/metadataVersions';
import {
  appendContentVersion,
  contentVersionsFor,
  restoreContentVersion,
} from '../utils/contentVersions';
import { lineDiff, wordDiff, type LineDiffEntry } from '../utils/diff';

export type BottomTab = 'flesch' | 'checklist' | 'seo' | 'prompts';

interface ArticleWorkspaceProps {
  article: GeneratedArticle;
  onUpdateArticle: (updated: GeneratedArticle) => void;
  activeFormat?: OutputFormatId;
  onSelectFormat?: (format: OutputFormatId) => void;
  profile: UserProfile;
  multiAgentConfig: MultiAgentConfig;
  /** Present only when the strict reviewer halted this article. */
  onRetryCreator?: () => void;
  onSkipToDesigner?: () => void;
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

/**
 * Inline word-level marked diff for one metadata field: unchanged words plain,
 * removed words struck through in red, added words green. `from` is the saved
 * version, `to` the metadata currently in play.
 */
const WordDiffText: React.FC<{ from: string; to: string }> = ({ from, to }) => (
  <>
    {wordDiff(from, to).map((token, index) => {
      if (token.type === 'del') {
        return (
          <span
            key={index}
            className="text-rose-400 bg-rose-950/40 line-through decoration-rose-500/70"
          >
            {token.text}
          </span>
        );
      }
      if (token.type === 'add') {
        return (
          <span key={index} className="text-emerald-400 bg-emerald-950/40">
            {token.text}
          </span>
        );
      }
      return (
        <span key={index} className="text-zinc-400">
          {token.text}
        </span>
      );
    })}
  </>
);

const MAX_DIFF_ROWS = 2000;
const SAME_RUN_COLLAPSE = 6;

/**
 * Line-level marked diff of a saved snapshot against the buffer in play.
 * Long unchanged runs collapse to an ellipsis so a small edit deep inside a
 * long document is still findable; output is capped so a pathological pair of
 * documents cannot lock the panel.
 */
const LineDiffView: React.FC<{ from: string; to: string }> = ({ from, to }) => {
  const entries = lineDiff(from, to);

  if (entries.every((entry) => entry.type === 'same')) {
    return (
      <p className="text-[11px] font-mono text-zinc-500">
        No differences from the current buffer.
      </p>
    );
  }

  const truncated = entries.length > MAX_DIFF_ROWS;
  const shown = truncated ? entries.slice(0, MAX_DIFF_ROWS) : entries;

  type Row = { kind: 'line'; entry: LineDiffEntry } | { kind: 'gap'; count: number };
  const rows: Row[] = [];
  let index = 0;
  while (index < shown.length) {
    const entry = shown[index];
    if (entry.type !== 'same') {
      rows.push({ kind: 'line', entry });
      index++;
      continue;
    }
    let run = 0;
    while (index + run < shown.length && shown[index + run].type === 'same') run++;
    if (run > SAME_RUN_COLLAPSE) {
      for (let k = 0; k < 3; k++) rows.push({ kind: 'line', entry: shown[index + k] });
      rows.push({ kind: 'gap', count: run - 6 });
      for (let k = run - 3; k < run; k++) rows.push({ kind: 'line', entry: shown[index + k] });
    } else {
      for (let k = 0; k < run; k++) rows.push({ kind: 'line', entry: shown[index + k] });
    }
    index += run;
  }

  return (
    <div className="max-h-64 overflow-auto rounded-md border border-zinc-800 bg-zinc-950">
      {rows.map((row, i) =>
        row.kind === 'gap' ? (
          <div
            key={i}
            className="px-2 py-1 text-center text-[10px] font-mono text-zinc-600 border-y border-zinc-900"
          >
            … {row.count} unchanged line{row.count === 1 ? '' : 's'} …
          </div>
        ) : (
          <div
            key={i}
            className={`flex gap-2 px-2 py-0.5 ${
              row.entry.type === 'del'
                ? 'bg-rose-950/30'
                : row.entry.type === 'add'
                  ? 'bg-emerald-950/30'
                  : ''
            }`}
          >
            <span
              className={`w-3 shrink-0 select-none text-[10px] font-mono ${
                row.entry.type === 'del'
                  ? 'text-rose-500'
                  : row.entry.type === 'add'
                    ? 'text-emerald-500'
                    : 'text-zinc-700'
              }`}
            >
              {row.entry.type === 'del' ? '-' : row.entry.type === 'add' ? '+' : ' '}
            </span>
            <span
              className={`min-w-0 whitespace-pre-wrap break-all font-mono text-[11px] ${
                row.entry.type === 'del'
                  ? 'text-rose-300'
                  : row.entry.type === 'add'
                    ? 'text-emerald-300'
                    : 'text-zinc-500'
              }`}
            >
              {row.entry.text || ' '}
            </span>
          </div>
        )
      )}
      {truncated && (
        <div className="border-t border-zinc-900 px-2 py-1 text-center text-[10px] font-mono text-amber-500/80">
          Diff truncated at {MAX_DIFF_ROWS} lines
        </div>
      )}
    </div>
  );
};

export const ArticleWorkspace: React.FC<ArticleWorkspaceProps> = ({
  article,
  onUpdateArticle,
  activeFormat: controlledFormat,
  onSelectFormat,
  profile,
  multiAgentConfig,
  onRetryCreator,
  onSkipToDesigner,
}) => {
  /**
   * Formats this run actually produced. A format that was not checked was never
   * rendered, so it is offered as a locked entry rather than shown as editable:
   * opening one would present an empty editor as though it held a result.
   */
  const generatedFormats = useMemo<OutputFormatId[]>(
    () =>
      (Object.keys(article.formats ?? {}) as OutputFormatId[]).filter(
        (id) => Boolean(article.formats[id]?.trim())
      ),
    [article.formats]
  );
  const isGenerated = (id: OutputFormatId) => generatedFormats.includes(id);

  // Active Format for Results panel. Defaults to the first format this run made,
  // so opening the results never lands on a format that was not generated.
  const firstGenerated = generatedFormats[0] ?? 'inline-en';
  const [internalFormat, setInternalFormat] = useState<OutputFormatId>(firstGenerated);
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
  const [improveLog, setImproveLog] = useState<string[]>([]);
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

  /**
   * The HTML stored for a format, repaired when a clean render came back
   * truncated. Memoised because it is derived work, not a value.
   */
  const storedContent = useMemo((): string => {
    // Articles generated before the shell rules existed still carry the grey page
    // background and the width cap. They are normalized on the way in, so opening
    // one shows and edits the corrected document rather than the old artefact.
    const content = normalizeRenderedHtml(article.formats[selectedFormat] || '');

    if (selectedFormat === 'clean-en' || selectedFormat === 'clean-id') {
      if (isCleanHtmlIncomplete(content)) {
        const sibling = selectedFormat === 'clean-en' ? 'inline-en' : 'inline-id';
        return synthesizeCleanHtml(
          article.formats[sibling] || article.inlineCssHtml,
          content,
          article.topic
        );
      }
    }

    // Older articles stored the English render in the top-level mirrors. Read
    // them as a fallback but never past an empty string, so an article that
    // rendered no such format yields an empty buffer rather than undefined.
    if (selectedFormat === 'inline-en') {
      return content || normalizeRenderedHtml(article.inlineCssHtml || '');
    }
    if (selectedFormat === 'clean-en') {
      return content || normalizeRenderedHtml(article.cleanHtml || '');
    }
    return content;
  }, [article.formats, article.inlineCssHtml, article.cleanHtml, article.topic, selectedFormat]);

  /**
   * The editor holds its own copy of the document.
   *
   * It used to render straight from the article, so every keystroke published a
   * new article, which came back down as a changed `value` and pushed the caret
   * to the end of the field. The buffer is local, and persistence is debounced
   * behind it, so typing is never interrupted by a round trip.
   */
  const [draft, setDraft] = useState(storedContent);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Re-seed the buffer when the reader switches format or article, but never
  // while they are typing in the one they are on.
  useEffect(() => {
    setDraft(storedContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFormat, article.id]);

  const commitRef = useRef<number | null>(null);
  const persistDraft = useCallback(
    (format: OutputFormatId, content: string) => {
      onUpdateArticle({
        ...article,
        formats: { ...article.formats, [format]: content },
        // The top-level mirrors name their own language; they are not a fallback
        // for the other one.
        ...(format === 'inline-en' ? { inlineCssHtml: content } : {}),
        ...(format === 'clean-en' ? { cleanHtml: content } : {}),
      });
    },
    [article, onUpdateArticle]
  );

  /** Debounced write of the buffer to the article, so scoring and export see edits. */
  const schedulePersist = useCallback(
    (format: OutputFormatId, content: string) => {
      if (commitRef.current !== null) window.clearTimeout(commitRef.current);
      commitRef.current = window.setTimeout(() => {
        commitRef.current = null;
        persistDraft(format, content);
      }, 400);
    },
    [persistDraft]
  );

  // A pending edit must not be lost when the reader leaves the panel.
  useEffect(
    () => () => {
      if (commitRef.current !== null) {
        window.clearTimeout(commitRef.current);
        persistDraft(selectedFormat, draftRef.current);
      }
    },
    [selectedFormat, persistDraft]
  );

  const handleDraftChange = (next: string) => {
    setDraft(next);
    schedulePersist(selectedFormat, next);
  };

  const currentContent = draft;

  // Updater for the current format content. Writes immediately, because these
  // are deliberate edits (a toolbar insert, prettify, an AI repair) rather than
  // keystrokes.
  const updateCurrentFormatContent = (newContent: string) => {
    setDraft(newContent);
    persistDraft(selectedFormat, newContent);
  };

  // Sync Live Iframe Preview when the buffer changes. Driven by the local draft
  // rather than the article, so the preview follows the keystroke instead of the
  // debounced write.
  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        const content = draft;
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
        padding: 0;
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
  }, [draft, selectedFormat]);

  // Insert HTML Tag at cursor / wrap selected text in code editor
  const insertHtmlTag = (tagOpen: string, tagClose: string = '', defaultPlaceholder: string = '') => {
    const textarea = codeEditorRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = draftRef.current;
    const selectedText = currentVal.substring(start, end) || defaultPlaceholder;

    const replacement = `${tagOpen}${selectedText}${tagClose}`;
    const updated = currentVal.substring(0, start) + replacement + currentVal.substring(end);

    setUndoStack((stack) => [...stack, { format: selectedFormat, html: currentVal }].slice(-30));
    updateCurrentFormatContent(updated);

    // Restore the selection over the text that was wrapped. Without this the
    // caret lands at the end of the document after every toolbar insert.
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + tagOpen.length,
        start + tagOpen.length + selectedText.length
      );
    });
  };

  // Clean / Prettify Indentations
  const handlePrettifyHtml = () => {
    const raw = draftRef.current;
    const cleaned = raw
      .replace(/>\s*</g, '>\n<')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    setUndoStack((stack) => [...stack, { format: selectedFormat, html: raw }].slice(-30));
    updateCurrentFormatContent(cleaned);
    showCopyFeedback('prettified');
  };

  // Copy code of active format
  const handleCopyCode = async () => {
    const success = await copyToClipboard(currentContent);
    if (success) showCopyFeedback('code');
  };

  // Copy plain text of active format
  const handleCopyCleanText = async () => {
    const stripped = currentContent
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
    const slug = metaDraft.urlSlug || 'commercial-fitness-article';
    const filename = `${slug}-${selectedFormat}.html`;
    downloadFile(filename, currentContent, 'text/html;charset=utf-8');
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

  /**
   * Ask the agent to repair this format.
   *
   * The call carries the measured context -- the checks currently failing, the
   * reviewer's issues, the brief and the brand tokens -- so the agent fixes a
   * named problem instead of rewriting the article on a hunch. The editor keeps
   * its buffer, so an unsaved edit is what gets repaired and the result lands in
   * the editor, undoable like any other change.
   */
  const handleRunImprovement = async (instructionToUse?: string) => {
    const instruction = (instructionToUse ?? improveInstruction).trim();
    if (isImproving) return;
    setIsImproving(true);
    setImproveError(null);
    setImproveLog([]);

    try {
      const result = await improveArticle({
        article,
        format: selectedFormat,
        html: draftRef.current,
        instruction,
        score: liveScore,
        profile,
        multiAgentConfig,
        signal: new AbortController().signal,
      });

      if (!result.html.trim()) {
        setImproveError('The agent returned no HTML. Try rephrasing the instruction.');
        return;
      }

      setUndoStack((stack) =>
        [...stack, { format: selectedFormat, html: draftRef.current }].slice(-30)
      );
      updateCurrentFormatContent(result.html);
      setImproveLog(result.changes);
      showCopyFeedback('improved');
    } catch (err) {
      setImproveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsImproving(false);
    }
  };

  // Undo last edit/improvement
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    // Undo walks back to the most recent entry for this format; an edit to one
    // format must not roll back a different one.
    const index = undoStack.map((entry) => entry.format).lastIndexOf(selectedFormat);
    if (index < 0) return;
    const next = undoStack.slice(0, index);
    setUndoStack(next);
    updateCurrentFormatContent(undoStack[index].html);
    showCopyFeedback('undone');
  };

  // ---- SEO metadata editing + versioning -----------------------------------
  /**
   * The metadata fields keep their own buffer for the same reason the HTML
   * editor does. They were bound straight to the article, so every keystroke
   * published a new article, came back down as a changed `value`, and threw
   * the character away — typing did nothing.
   */
  const [metaDraft, setMetaDraft] = useState(article.seoMetadata);
  const metaRef = useRef(metaDraft);
  metaRef.current = metaDraft;

  useEffect(() => {
    setMetaDraft(article.seoMetadata);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.id]);

  const metaCommitRef = useRef<number | null>(null);
  const persistMetadata = useCallback(
    (metadata: SeoMetadata) => {
      onUpdateArticle({
        ...article,
        seoMetadata: metadata,
        focusKeyphrase: metadata.focusKeyphrase || article.focusKeyphrase,
        seoMetadataEn: article.seoMetadataEn,
        seoMetadataId: article.seoMetadataId,
      });
    },
    [article, onUpdateArticle]
  );

  const handleMetaChange = (patch: Partial<SeoMetadata>) => {
    const next = { ...metaRef.current, ...patch };
    setMetaDraft(next);
    if (metaCommitRef.current !== null) window.clearTimeout(metaCommitRef.current);
    metaCommitRef.current = window.setTimeout(() => {
      metaCommitRef.current = null;
      persistMetadata(next);
    }, 400);
  };

  useEffect(
    () => () => {
      if (metaCommitRef.current !== null) {
        window.clearTimeout(metaCommitRef.current);
        persistMetadata(metaRef.current);
      }
    },
    [persistMetadata]
  );

  const metadataVersions = versionsFor(
    article.metadataVersions,
    article.seoMetadata,
    article.generatedAt
  );
  const [versionLabel, setVersionLabel] = useState('');
  const [restoredFrom, setRestoredFrom] = useState<number | null>(null);

  const saveMetadataVersion = (label?: string) => {
    // Commit any pending keystroke first, so the version records what is on
    // screen rather than the last debounced write.
    if (metaCommitRef.current !== null) {
      window.clearTimeout(metaCommitRef.current);
      metaCommitRef.current = null;
    }
    const next = appendMetadataVersion(metadataVersions, metaDraft, {
      label: label ?? (versionLabel.trim() ? versionLabel : undefined),
    });
    onUpdateArticle({ ...article, seoMetadata: metaDraft, metadataVersions: next });
    setRestoredFrom(null);
    setVersionLabel('');
    showCopyFeedback('metaVersion');
  };

  const restoreMetadata = (version: number) => {
    const restored = restoreMetadataVersion(metadataVersions, version);
    if (!restored) return;
    setMetaDraft(restored.metadata);
    onUpdateArticle({
      ...article,
      seoMetadata: restored.metadata,
      focusKeyphrase: restored.metadata.focusKeyphrase || article.focusKeyphrase,
      seoMetadataEn: article.seoMetadataEn,
      seoMetadataId: article.seoMetadataId,
      metadataVersions: restored.versions,
    });
    setRestoredFrom(version);
    showCopyFeedback('metaRestored');
  };

  // ---- Article content versioning ------------------------------------------
  const contentVersions = contentVersionsFor(article.contentVersions, selectedFormat);
  const [contentVersionLabel, setContentVersionLabel] = useState('');
  const [contentRestoredFrom, setContentRestoredFrom] = useState<number | null>(null);
  /**
   * Diff-first browsing: selecting a version expands its marked diff against
   * what is in play; the editor buffer only changes when Restore is confirmed.
   */
  const [openDiff, setOpenDiff] = useState<{ kind: 'meta' | 'content'; version: number } | null>(
    null
  );
  const toggleDiff = (kind: 'meta' | 'content', version: number) =>
    setOpenDiff((previous) =>
      previous && previous.kind === kind && previous.version === version
        ? null
        : { kind, version }
    );

  const formatName =
    FORMAT_OPTIONS.find((option) => option.id === selectedFormat)?.name ?? selectedFormat;

  /** Pins the buffer of the current format as a new snapshot in version storage. */
  const saveContentVersion = () => {
    // Commit any pending keystroke first, so the snapshot and the stored
    // article describe the same bytes rather than the last debounced write.
    if (commitRef.current !== null) {
      window.clearTimeout(commitRef.current);
      commitRef.current = null;
    }
    const html = draftRef.current;
    const next = appendContentVersion(article.contentVersions, html, selectedFormat, {
      label: contentVersionLabel,
    });
    onUpdateArticle({
      ...article,
      formats: { ...article.formats, [selectedFormat]: html },
      ...(selectedFormat === 'inline-en' ? { inlineCssHtml: html } : {}),
      ...(selectedFormat === 'clean-en' ? { cleanHtml: html } : {}),
      contentVersions: next,
    });
    setContentVersionLabel('');
    showCopyFeedback('contentVersion');
  };

  const restoreContent = (version: number) => {
    const restored = restoreContentVersion(article.contentVersions, version);
    if (!restored) return;
    if (commitRef.current !== null) {
      window.clearTimeout(commitRef.current);
      commitRef.current = null;
    }

    const formats = { ...article.formats };
    const mirrorPatch: Partial<Pick<GeneratedArticle, 'inlineCssHtml' | 'cleanHtml'>> = {};
    // Restore is a deliberate edit like the toolbar actions, so the content it
    // replaces is pushed for undo. The reader can only click a snapshot of the
    // format they are on, but the flush below keeps a cross-format restore from
    // dropping an unsaved edit of the format being left behind.
    const previousHtml =
      restored.format === selectedFormat
        ? draftRef.current
        : (article.formats[restored.format] ?? '');
    setUndoStack((stack) => [...stack, { format: restored.format, html: previousHtml }].slice(-30));
    if (restored.format !== selectedFormat) {
      formats[selectedFormat] = draftRef.current;
      if (selectedFormat === 'inline-en') mirrorPatch.inlineCssHtml = draftRef.current;
      if (selectedFormat === 'clean-en') mirrorPatch.cleanHtml = draftRef.current;
    }
    formats[restored.format] = restored.html;
    if (restored.format === 'inline-en') mirrorPatch.inlineCssHtml = restored.html;
    if (restored.format === 'clean-en') mirrorPatch.cleanHtml = restored.html;

    onUpdateArticle({
      ...article,
      formats,
      ...mirrorPatch,
      contentVersions: restored.versions,
    });
    if (restored.format !== selectedFormat) handleSetFormat(restored.format);
    setDraft(restored.html);
    setOpenDiff(null);
    setContentRestoredFrom(version);
  };

  /**
   * Live scoring, measured on both buffers as the reader types: the HTML being
   * edited and the metadata being typed. The same deterministic checks the
   * pipeline scores with, so the number here is the number that will be stored,
   * and tightening the SEO title moves the score before the debounce fires.
   */
  const liveScore = useMemo(
    () =>
      scoreHtml(
        draft,
        metaDraft,
        metaDraft.focusKeyphrase,
        article.targetWordCount,
        selectedFormat.endsWith('-id') ? 'id' : 'en'
      ),
    [draft, metaDraft, article.targetWordCount, selectedFormat]
  );

  // Calculate live stats of current format
  const currentFormatStats = useMemo(() => {
    const content = draft ?? '';
    const stripped = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .trim();
    const words = stripped ? stripped.split(/\s+/).length : 0;
    const chars = content.length;
    const readMins = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readMins };
  }, [draft]);

  const activeFormatMeta = FORMAT_OPTIONS.find((f) => f.id === selectedFormat) || FORMAT_OPTIONS[0];

  // A zero means the run measured nothing, so it is shown as absent rather than as a score.
  const measuredFlesch = liveScore.flesch > 0 ? liveScore.flesch : null;

  // A run that never rendered the selected format has nothing to show. Say so,
  // rather than presenting an empty editor that reads like an empty article.
  if (generatedFormats.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center space-y-2">
        <Lock className="w-6 h-6 text-zinc-500 mx-auto" />
        <p className="text-sm font-semibold text-zinc-200">Not checked / not generated</p>
        <p className="text-xs text-zinc-400">
          This run produced no HTML formats, so there is nothing to edit here. Check the formats
          you want on the Generate screen and run again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Review Gate Banner — shown only when the strict reviewer halted this draft */}
      {onRetryCreator && onSkipToDesigner && (
        <div className="bg-amber-950/40 border border-amber-700 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-amber-100">
                Reviewer halted this draft
              </h3>
              <p className="text-xs text-amber-200/80 mt-0.5 leading-relaxed">
                The strict reviewer did not clear it after one automatic revision. The Markdown
                below stays fully readable and copyable. Retry the Creator for a fresh attempt, or
                skip straight to the Designer to render the current draft as-is.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-8">
            <button
              onClick={onRetryCreator}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold text-xs transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Creator</span>
            </button>
            <button
              onClick={onSkipToDesigner}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 font-semibold text-xs transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Skip to Designer</span>
            </button>
          </div>
        </div>
      )}

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
            <span
              className={`font-semibold font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 ${
                measuredFlesch === null
                  ? 'text-zinc-500'
                  : liveScore.checks.find((check) => check.id === 'flesch_range')?.passed
                    ? 'text-emerald-400'
                    : 'text-amber-400'
              }`}
            >
              {measuredFlesch === null ? '— not measured' : measuredFlesch}
            </span>
          </div>

          {/* Live score, measured on the buffer as it is typed. */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-mono">Live Score:</span>
            <span
              className={`font-semibold font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 ${
                liveScore.passed ? 'text-emerald-400' : 'text-amber-400'
              }`}
              title={`${liveScore.checks.length - liveScore.failed.length} of ${liveScore.checks.length} checks passing`}
            >
              {liveScore.total}/100
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
            title="Download complete bundle ZIP with every generated format"
          >
            <FileArchive className="w-3.5 h-3.5 text-zinc-950" />
            <span>
              {isZipping
                ? 'Archiving...'
                : `Download All (${generatedFormats.length} Format${generatedFormats.length === 1 ? '' : 's'} ZIP)`}
            </span>
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
                      const generated = isGenerated(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={!generated}
                          onClick={() => handleSetFormat(opt.id)}
                          title={
                            generated
                              ? opt.desc
                              : `${opt.name} was not checked for this run, so it was never generated.`
                          }
                          className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors flex items-start justify-between gap-3 ${
                            !generated
                              ? 'cursor-not-allowed opacity-45'
                              : isSelected
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
                              {generated ? opt.desc : 'Not checked / not generated'}
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                          {!generated && (
                            <Lock className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {generatedFormats.length < FORMAT_OPTIONS.length && (
                    <div className="px-3 py-2 border-t border-zinc-800 text-[11px] text-zinc-500 leading-tight">
                      Locked formats were not checked for this run, so no HTML was produced for
                      them. Check them on the Generate screen and run again to get them.
                    </div>
                  )}
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
              title="Copy active format HTML code"
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
                void handleRunImprovement(
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
                void handleRunImprovement(
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
                void handleRunImprovement(
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
                void handleRunImprovement(
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
                    void handleRunImprovement();
                  }
                }}
                placeholder="Type specific enhancement (e.g., 'Add a section on hotel gym equipment space planning with 250 sq meter layout')..."
                className="flex-1 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-500"
              />
              <button
                onClick={() => void handleRunImprovement()}
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

            {/* What the agent was told, so a repair is never a guess. */}
            <div className="text-[11px] text-zinc-400 font-mono bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5 space-y-1">
              <div className="text-zinc-500 uppercase tracking-wider text-[10px]">
                Context sent with this request
              </div>
              <div>
                Failing checks:{' '}
                <span className="text-zinc-200">
                  {liveScore.failed.length > 0
                    ? liveScore.failed.map((check) => check.id).join(', ')
                    : 'none'}
                </span>
              </div>
              <div>
                Reviewer issues:{' '}
                <span className="text-zinc-200">
                  {article.reviewReport?.issues.length ?? 0}
                </span>{' '}
                · Brief, brand tokens and source markdown included
              </div>
            </div>

            {improveLog.length > 0 && (
              <div className="text-[11px] text-emerald-300 font-mono bg-emerald-950/40 border border-emerald-900 rounded-lg p-2.5 space-y-1">
                <div className="text-emerald-400 uppercase tracking-wider text-[10px]">
                  Applied changes
                </div>
                <ul className="space-y-0.5 list-disc pl-4">
                  {improveLog.map((change, index) => (
                    <li key={index}>{change}</li>
                  ))}
                </ul>
                <div className="text-zinc-400 pt-1">
                  Score {liveScore.total}/100 · undo with the Undo button
                </div>
              </div>
            )}

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
              </div><div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300">
                  {currentFormatStats.words} w
                </span>
                <span className="text-zinc-500 font-mono">{currentFormatStats.chars} chars</span>
                <span
                  className={`px-1.5 py-0.5 rounded font-mono border ${
                    liveScore.passed
                      ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                      : 'bg-amber-950/50 border-amber-800 text-amber-300'
                  }`}
                  title={`${liveScore.checks.length - liveScore.failed.length} of ${liveScore.checks.length} checks passing`}
                >
                  {liveScore.total}/100
                </span>
              </div>
            </div>

            {/* Editable Textarea with full editing capabilities */}
            <div className="flex-1 relative flex">
              <textarea
                ref={codeEditorRef}
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  // Tab indents the current line, and indents every line of a
                  // multi-line selection, instead of losing focus to the next
                  // element on the page.
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const textarea = e.currentTarget;
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const value = draftRef.current;

                    if (!e.shiftKey && start !== end) {
                      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                      const block = value.slice(lineStart, end);
                      const indented = block.replace(/^/gm, '  ');
                      const next = value.slice(0, lineStart) + indented + value.slice(end);
                      handleDraftChange(next);
                      requestAnimationFrame(() => {
                        textarea.setSelectionRange(lineStart, lineStart + indented.length);
                      });
                      return;
                    }

                    handleDraftChange(
                      value.slice(0, start) + '  ' + value.slice(end)
                    );
                    requestAnimationFrame(() => {
                      textarea.setSelectionRange(start + 2, start + 2);
                    });
                    return;
                  }

                  // Cmd/Ctrl+S saves the file rather than the browser dialog.
                  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    handleDownloadFile();
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
                    realleaderusa.id/blog/{metaDraft.urlSlug}?format={selectedFormat}
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
              content={currentContent}
              language={selectedFormat.endsWith('-id') ? 'id' : 'en'}
              onLanguageChange={(newLang) => {
                if (newLang === 'id' && !selectedFormat.endsWith('-id')) {
                  const target: OutputFormatId = 'inline-id';
                  if (isGenerated(target)) handleSetFormat(target);
                } else if (newLang === 'en' && selectedFormat.endsWith('-id')) {
                  const target: OutputFormatId = 'inline-en';
                  if (isGenerated(target)) handleSetFormat(target);
                }
              }}
            />
          )}

          {/* TAB 2: SEO CHECKLIST */}
          {bottomTab === 'checklist' && (
            <SeoChecklistPanel
              htmlContent={currentContent}
              metadata={metaDraft}
              focusKeyphraseInput={metaDraft.focusKeyphrase}
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
                    const metaText = `SEO Title: ${metaDraft.seoTitle}\nHeadline: ${metaDraft.headline}\nFocus Keyphrase: ${metaDraft.focusKeyphrase}\nMeta Description: ${metaDraft.metaDescription}\nURL Slug: ${metaDraft.urlSlug}\nTags: ${metaDraft.tags.join(', ')}`;
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

              {/* Version history in two sections. Each entry expands into its
                  own marked diff against what is in play; nothing is written
                  until Restore is confirmed. */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 space-y-3">
                <span className="text-xs font-mono uppercase text-zinc-400 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  Version History
                </span>

                {/* SEO metadata snapshots — version 1 is the pipeline's own
                    output, stamped when the article was generated. */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-zinc-300">
                      SEO Metadata ({metadataVersions.length})
                    </span>
                    {copiedKey === 'metaVersion' && (
                      <span className="text-[11px] text-emerald-400 font-mono">
                        Version saved
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={versionLabel}
                      onChange={(e) => setVersionLabel(e.target.value)}
                      placeholder="Label this version (optional)"
                      className="flex-1 min-w-[180px] bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-100 outline-none focus:border-zinc-600"
                    />
                    <button
                      onClick={() => saveMetadataVersion()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Save current as new version
                    </button>
                  </div>

                  <ul className="space-y-1.5">
                    {[...metadataVersions].reverse().map((entry) => {
                      const changes = metadataDiff(entry.metadata, metaDraft);
                      const isCurrent = changes.length === 0;
                      const isOpen =
                        openDiff?.kind === 'meta' && openDiff.version === entry.version;
                      return (
                        <li
                          key={entry.version}
                          className={`rounded-lg border ${
                            isCurrent
                              ? 'bg-emerald-950/30 border-emerald-900'
                              : 'bg-zinc-950 border-zinc-800'
                          }`}
                        >
                          <button
                            onClick={() => toggleDiff('meta', entry.version)}
                            className="w-full flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 text-left"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-semibold text-zinc-100">
                                  v{entry.version}
                                </span>
                                <span className="text-xs text-zinc-300 truncate">
                                  {entry.label}
                                </span>
                                {isCurrent && (
                                  <span className="text-[10px] font-mono uppercase text-emerald-400">
                                    current
                                  </span>
                                )}
                                {restoredFrom === entry.version && !isCurrent && (
                                  <span className="text-[10px] font-mono uppercase text-amber-400">
                                    restored
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                                {formatVersionStamp(entry.savedAt)}
                                {changes.length > 0 && ` · ${changes.length} field(s) differ`}
                              </div>
                            </div>
                            <ChevronDown
                              className={`w-3.5 h-3.5 shrink-0 text-zinc-500 transition-transform ${
                                isOpen ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                          {isOpen && (
                            <div className="space-y-2 border-t border-zinc-800 px-2.5 pb-2.5 pt-2">
                              {changes.length === 0 ? (
                                <p className="text-[11px] font-mono text-zinc-500">
                                  Identical to the metadata in play — nothing differs.
                                </p>
                              ) : (
                                changes.map((change) => (
                                  <div key={change.field} className="space-y-1">
                                    <span className="block text-[10px] font-mono uppercase text-zinc-500">
                                      {change.field}
                                    </span>
                                    <div className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] leading-relaxed break-words">
                                      <WordDiffText from={change.from} to={change.to} />
                                    </div>
                                  </div>
                                ))
                              )}
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[10px] font-mono text-zinc-600">
                                  v{entry.version} → current
                                </span>
                                {!isCurrent && (
                                  <button
                                    onClick={() => restoreMetadata(entry.version)}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-[11px] font-semibold transition-colors"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Restore this version
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Manual HTML snapshots of the format currently open. */}
                <div className="space-y-2.5 border-t border-zinc-800 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-zinc-300">
                      Article Content — {formatName} ({contentVersions.length})
                    </span>
                    {copiedKey === 'contentVersion' && (
                      <span className="text-[11px] text-emerald-400 font-mono">
                        Version saved
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={contentVersionLabel}
                      onChange={(e) => setContentVersionLabel(e.target.value)}
                      placeholder="Label this snapshot (optional)"
                      className="flex-1 min-w-[180px] bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-100 outline-none focus:border-zinc-600"
                    />
                    <button
                      onClick={saveContentVersion}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Save current as new version
                    </button>
                  </div>

                  {contentVersions.length === 0 ? (
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      No snapshots yet. Save one to pin the current HTML of this format, then
                      compare or restore it later.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {[...contentVersions].reverse().map((entry) => {
                        const isCurrent = entry.html === draft;
                        const isOpen =
                          openDiff?.kind === 'content' && openDiff.version === entry.version;
                        return (
                          <li
                            key={entry.version}
                            className={`rounded-lg border ${
                              isCurrent
                                ? 'bg-emerald-950/30 border-emerald-900'
                                : 'bg-zinc-950 border-zinc-800'
                            }`}
                          >
                            <button
                              onClick={() => toggleDiff('content', entry.version)}
                              className="w-full flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 text-left"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-semibold text-zinc-100">
                                    v{entry.version}
                                  </span>
                                  <span className="text-xs text-zinc-300 truncate">
                                    {entry.label}
                                  </span>
                                  {isCurrent && (
                                    <span className="text-[10px] font-mono uppercase text-emerald-400">
                                      current
                                    </span>
                                  )}
                                  {contentRestoredFrom === entry.version && !isCurrent && (
                                    <span className="text-[10px] font-mono uppercase text-amber-400">
                                      restored
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                                  {formatVersionStamp(entry.savedAt)}
                                  {!isCurrent && ' · differs from buffer'}
                                </div>
                              </div>
                              <ChevronDown
                                className={`w-3.5 h-3.5 shrink-0 text-zinc-500 transition-transform ${
                                  isOpen ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                            {isOpen && (
                              <div className="space-y-2 border-t border-zinc-800 px-2.5 pb-2.5 pt-2">
                                <LineDiffView from={entry.html} to={draft} />
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[10px] font-mono text-zinc-600">
                                    v{entry.version} → current buffer
                                  </span>
                                  {!isCurrent && (
                                    <button
                                      onClick={() => restoreContent(entry.version)}
                                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-[11px] font-semibold transition-colors"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      Restore this version
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
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
                          metaDraft.seoTitle.length > 55
                            ? 'text-amber-400'
                            : 'text-zinc-400'
                        }`}
                      >
                        {metaDraft.seoTitle.length}/55
                      </span>
                      <button
                        onClick={() => {
                          copyToClipboard(metaDraft.seoTitle);
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
                    value={metaDraft.seoTitle}
                    onChange={(e) => handleMetaChange({ seoTitle: e.target.value })}
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
                        copyToClipboard(metaDraft.headline);
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
                    value={metaDraft.headline}
                    onChange={(e) => handleMetaChange({ headline: e.target.value })}
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
                          metaDraft.focusKeyphrase.length > 20
                            ? 'text-amber-400'
                            : 'text-zinc-400'
                        }`}
                      >
                        {metaDraft.focusKeyphrase.length}/20
                      </span>
                      <button
                        onClick={() => {
                          copyToClipboard(metaDraft.focusKeyphrase);
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
                    value={metaDraft.focusKeyphrase}
                    onChange={(e) => handleMetaChange({ focusKeyphrase: e.target.value })}
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
                        copyToClipboard(metaDraft.urlSlug);
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
                    value={metaDraft.urlSlug}
                    onChange={(e) => handleMetaChange({ urlSlug: e.target.value })}
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
                          metaDraft.metaDescription.length > 155
                            ? 'text-amber-400'
                            : 'text-zinc-400'
                        }`}
                      >
                        {metaDraft.metaDescription.length}/155
                      </span>
                      <button
                        onClick={() => {
                          copyToClipboard(metaDraft.metaDescription);
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
                    value={metaDraft.metaDescription}
                    onChange={(e) => handleMetaChange({ metaDescription: e.target.value })}
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
                        copyToClipboard(metaDraft.tags.join(', '));
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
                    {metaDraft.tags.map((tag, i) => (
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
