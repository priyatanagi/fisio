import React, { useRef, useState } from 'react';
import { Upload, Download, AlertTriangle, HelpCircle, ChevronDown } from 'lucide-react';
import type { BatchRow } from '../pipeline/useBatchQueue';
import type { ColumnGuideEntry } from '../utils/csv';

interface BatchUploadTableProps {
  rows: BatchRow[];
  fileName: string;
  onRows: (rows: BatchRow[], fileName: string) => void;
}

export const BatchUploadTable: React.FC<BatchUploadTableProps> = ({ rows, fileName, onRows }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guide, setGuide] = useState<ColumnGuideEntry[] | null>(null);

  // The guide shares a module with the parser; load it on first open so the
  // initial chunk stays free of the csv utilities, same as the template button.
  const toggleGuide = async () => {
    if (!guide) {
      const { COLUMN_GUIDE } = await import('../utils/csv');
      setGuide(COLUMN_GUIDE);
    }
    setGuideOpen((open) => !open);
  };

  const handleFile = async (file: File) => {
    const { parseCsv, validateRow } = await import('../utils/csv');
    const text = await file.text();
    const parsed = parseCsv(text);
    const globals = { impower: 'standard' as const, reviewer: 'strict' as const };

    const built = parsed.map((csvRow, index) => {
      const validated = validateRow(csvRow, globals);
      return {
        rowId: `r${index}`,
        index,
        seedTopic: csvRow.Topic_Idea,
        focusKeyphrase: csvRow.Focus_Keyphrase,
        targetLength: validated.targetLength,
        toneOverride: csvRow.Tone_Override,
        impowerOverride: (csvRow.Impower_Level || '') as BatchRow['impowerOverride'],
        reviewerOverride: (csvRow.Reviewer_Mode || '') as BatchRow['reviewerOverride'],
        status: 'pending' as const,
        stageMessage: '',
        error: null,
        reviewReport: null,
        articleId: null,
        startedAt: null,
        completedAt: null,
        validationWarning: validated.issues.length
          ? validated.issues.map((i) => `${i.field}: ${i.message}`).join('; ')
          : null,
      } satisfies BatchRow;
    });

    onRows(built, file.name);
  };

  // Both utilities stay behind an import() so the template button does not
  // drag the csv parser and the zip exporter into the initial chunk.
  const handleTemplate = async () => {
    const { batchTemplateCsv } = await import('../utils/csv');
    const { downloadFile } = await import('../utils/exportUtils');
    downloadFile('batch-template.csv', batchTemplateCsv(), 'text/csv;charset=utf-8');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold flex items-center gap-1.5"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload CSV
        </button>
        <button
          onClick={() => void handleTemplate()}
          className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-xs font-semibold flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          Download template
        </button>
        {fileName && (
          <span className="text-[11px] font-mono text-zinc-400">
            {fileName} — {rows.length} row{rows.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="text-[11px] text-zinc-500 font-mono bg-zinc-950 border border-zinc-800 rounded-lg p-2.5">
        Topic_Idea,Focus_Keyphrase,Target_Length,Tone_Override,Impower_Level,Reviewer_Mode
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-hidden">
        <button
          onClick={() => void toggleGuide()}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-zinc-900/60 hover:bg-zinc-900 text-left transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
            <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
            Column guide — what to put in each column
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${guideOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {guideOpen && (
          <div className="border-t border-zinc-800 p-3 space-y-3">
            {guide?.map((entry) => (
              <div key={entry.column} className="space-y-1">
                <div className="flex items-center gap-2">
                  <code className="text-[11px] font-mono text-zinc-200 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5">
                    {entry.column}
                  </code>
                  <span
                    className={`text-[10px] uppercase font-mono ${
                      entry.required ? 'text-amber-400' : 'text-zinc-600'
                    }`}
                  >
                    {entry.required ? 'required' : 'optional'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">{entry.description}</p>
                {entry.values && (
                  <div className="flex flex-wrap gap-1.5">
                    {entry.values.map((option) => (
                      <span
                        key={option.value}
                        title={option.hint}
                        className="text-[10px] font-mono text-zinc-300 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5"
                      >
                        {option.value}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] font-mono text-zinc-600">
                  e.g. <span className="text-zinc-400">{entry.example}</span>
                </p>
              </div>
            ))}
            {!guide && <p className="text-[11px] text-zinc-500">Loading guide…</p>}
            <p className="text-[10px] text-zinc-600 leading-relaxed border-t border-zinc-800 pt-2">
              Headers are matched by name, so columns can be reordered or re-cased. Blank optional
              columns inherit the batch defaults; unknown values fall back to the default and show
              up under Issues.
            </p>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="border border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium w-10">#</th>
                <th className="px-3 py-2 font-medium">Topic</th>
                <th className="px-3 py-2 font-medium">Keyphrase</th>
                <th className="px-3 py-2 font-medium">Length</th>
                <th className="px-3 py-2 font-medium">Impower</th>
                <th className="px-3 py-2 font-medium">Reviewer</th>
                <th className="px-3 py-2 font-medium">Issues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rowId} className="border-t border-zinc-800">
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-600">{row.index + 1}</td>
                  <td className="px-3 py-2 text-zinc-200 max-w-xs truncate">{row.seedTopic}</td>
                  <td className="px-3 py-2 text-zinc-400 max-w-xs truncate">{row.focusKeyphrase}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">{row.targetLength}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">
                    {row.impowerOverride || 'inherit'}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">
                    {row.reviewerOverride || 'inherit'}
                  </td>
                  <td className="px-3 py-2">
                    {row.validationWarning ? (
                      <span className="text-[10px] text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {row.validationWarning}
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-700">ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
