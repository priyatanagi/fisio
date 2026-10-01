import React, { useState } from 'react';
import { useBatchQueue, type BatchJob, type BatchRow } from '../pipeline/useBatchQueue';
import { downloadAllAsZip, downloadBatchAsZip } from '../utils/exportUtils';
import { listArticles } from '../db';
import type { GeneratedArticle } from '../types/article';
import type { UserProfile } from '../types/profile';
import type { MultiAgentConfig } from '../types/provider';
import type { UniversalRules } from '../config/universalRules';
import type { PipelineConfig } from '../pipeline/stages';
import { BatchUploadTable } from '../components/BatchUploadTable';
import { BatchQueueTable } from '../components/BatchQueueTable';

interface BatchViewProps {
  profile: UserProfile;
  multiAgentConfig: MultiAgentConfig;
  universalRules: UniversalRules;
  pipelineConfig: PipelineConfig;
}

export const BatchView: React.FC<BatchViewProps> = (props) => {
  const queue = useBatchQueue({
    profile: props.profile,
    multiAgentConfig: props.multiAgentConfig,
    universalRules: props.universalRules,
  });
  const [uploaded, setUploaded] = useState<BatchRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [articles, setArticles] = useState<GeneratedArticle[]>([]);

  const startJob = () => {
    if (uploaded.length === 0) return;
    const now = new Date().toISOString();
    const { targetWords, ...globalConfig } = props.pipelineConfig;
    const job: BatchJob = {
      jobId: `job_${Date.now()}`,
      fileName,
      createdAt: now,
      updatedAt: now,
      concurrency: 2,
      isPaused: false,
      customWordCount: targetWords,
      globalConfig,
      rows: uploaded.map((row) => ({ ...row })),
    };
    queue.loadJob(job);
    queue.start();
  };

  const handleRows = (rows: BatchRow[], name: string) => {
    setUploaded(rows);
    setFileName(name);
  };

  const exportRow = async (row: BatchRow) => {
    if (!row.articleId) return;
    const all = await listArticles();
    const found = all.find((a) => a.id === row.articleId);
    if (found) await downloadAllAsZip(found);
  };

  const exportAll = async () => {
    const doneIds = new Set(
      (queue.state.job?.rows ?? []).filter((r) => r.status === 'done' && r.articleId).map((r) => r.articleId!)
    );
    const all = await listArticles();
    const matching = all.filter((a) => doneIds.has(a.id));
    setArticles(matching);
    if (matching.length > 0) await downloadBatchAsZip(matching);
  };

  const job = queue.state.job;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-zinc-100">Batch generation</h2>
        <p className="text-[11px] text-zinc-400">
          Concurrency exists to avoid rate limits. Pause lets in-flight rows finish cleanly.
        </p>
      </div>

      <BatchUploadTable rows={uploaded} fileName={fileName} onRows={handleRows} />

      {job && (
        <BatchQueueTable
          job={job}
          articles={articles}
          onStart={() => {
            if (job.rows.every((r) => r.status !== 'pending')) {
              const fresh: BatchJob = { ...job, isPaused: false, rows: job.rows.map((r) => ({ ...r })) };
              queue.loadJob(fresh);
            }
            queue.start();
          }}
          onPause={queue.pause}
          onCancel={queue.cancel}
          onRetry={queue.retryRow}
          onConcurrency={queue.setConcurrency}
          onExportRow={exportRow}
          onExportAll={exportAll}
        />
      )}

      {uploaded.length > 0 && !job && (
        <button
          onClick={startJob}
          className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold"
        >
          Start batch with {uploaded.length} row{uploaded.length === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
};
