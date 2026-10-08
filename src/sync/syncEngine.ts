/**
 * One sync cycle, in plain functions: pull → merge → push what the queue holds.
 *
 * The engine takes its data access as dependencies and never touches React, so
 * the ordering — and the rule that a failed request must leave the queue
 * untouched — is testable against a stand-in PostgREST.
 */
import {
  CloudError,
  deleteRow,
  handshake,
  patchRow,
  selectAll,
  upsertRows,
  type CloudErrorKind,
  type CloudRestConfig,
  type CloudRow,
} from './supabaseRest';
import {
  articleStamp,
  chooseSettings,
  mergeArticleLists,
  rowToSettings,
  sanitizeCloudArticle,
  settingsToRow,
  shrinkArticleForCloud,
  type CloudSettings,
} from './syncMerge';
import type { SyncQueue } from './syncQueue';
import type { Tombstones } from './tombstones';
import type { GeneratedArticle } from '../types/article';

export interface SyncEngineDeps {
  /** Null until env plus workspace secret are both present. */
  config: () => CloudRestConfig | null;
  queue: SyncQueue;
  tombstones: Tombstones;
  listLocal: () => Promise<GeneratedArticle[]>;
  getLocal: (id: string) => Promise<GeneratedArticle | undefined>;
  writeLocal: (article: GeneratedArticle) => Promise<void>;
  removeLocal: (id: string) => Promise<void>;
  readSettings: () => CloudSettings;
  applySettings: (settings: CloudSettings) => void;
  /**
   * Reports the timestamp actually written to the settings row so the app can
   * remember it. A device that has never edited its rules has no stamp; without
   * this it would invent a newer one on every cycle and outvote the cloud.
   */
  onSettingsStamped?: (iso: string) => void;
}

export interface CycleResult {
  pulled: { added: number; updated: number };
  pushed: { articles: number; settings: boolean };
  error?: string;
  kind?: CloudErrorKind;
}

const NOT_CONFIGURED =
  'Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then paste the workspace secret in Providers -> Cloud storage.';

function messageOf(err: unknown): { message: string; kind: CloudErrorKind } {
  if (err instanceof CloudError) return { message: err.message, kind: err.kind };
  return { message: String((err as Error)?.message || err), kind: 'server' };
}

export function articleToRow(article: GeneratedArticle, workspaceSecret: string): CloudRow {
  return {
    id: article.id,
    workspace_secret: workspaceSecret,
    topic: article.topic ?? '',
    // Same NOT NULL guard as the settings row: a record with no usable time
    // anywhere still has to carry one.
    updated_at: articleStamp(article) || new Date().toISOString(),
    article,
  };
}

/** Reads every cloud row the secret opens, dropping rows this device deleted. */
async function pullArticles(
  config: CloudRestConfig,
  deps: SyncEngineDeps
): Promise<{ cloud: GeneratedArticle[]; tombstoned: Set<string> }> {
  const tombstoned = new Set(deps.tombstones.pendingIds());
  const rows = await selectAll(config, 'fisio_articles', { order: 'updated_at.desc' });
  const cloud: GeneratedArticle[] = [];
  for (const row of rows) {
    const article = sanitizeCloudArticle(row.article);
    if (!article || tombstoned.has(article.id)) continue;
    cloud.push(article);
  }
  return { cloud, tombstoned };
}

/** Pushes the deletes that failed earlier, so the cloud does not keep resurrecting them. */
async function pushDeletes(config: CloudRestConfig, deps: SyncEngineDeps): Promise<number> {
  let done = 0;
  for (const tombstone of deps.tombstones.unsynced()) {
    await deleteRow(config, 'fisio_articles', 'id', tombstone.id);
    await deps.tombstones.markSynced(tombstone.id);
    done++;
  }
  return done;
}

/**
 * Ids the cloud already holds. PostgREST cannot merge under forced row level
 * security — re-posting an existing row answers 409 `duplicate key value`
 * (verified against a live project) — so the engine asks what is there and
 * chooses insert vs patch itself.
 */
async function knownIds(config: CloudRestConfig, table: string, column: string): Promise<Set<string>> {
  const rows = await selectAll(config, table, { select: column });
  return new Set(rows.map((row) => String(row[column])));
}

async function pushArticles(config: CloudRestConfig, deps: SyncEngineDeps): Promise<number> {
  const { articleIds } = deps.queue.pending();
  if (articleIds.length === 0) return 0;

  const rows: CloudRow[] = [];
  const uploaded: string[] = [];
  for (const id of articleIds) {
    const local = await deps.getLocal(id);
    // Gone locally (deleted before it could upload) — nothing to push.
    if (!local) {
      deps.queue.drop(id);
      continue;
    }
    rows.push(articleToRow(shrinkArticleForCloud(local), config.secret));
    uploaded.push(id);
  }
  if (rows.length === 0) return 0;

  const known = await knownIds(config, 'fisio_articles', 'id');
  const fresh = rows.filter((row) => !known.has(String(row.id)));
  const existing = rows.filter((row) => known.has(String(row.id)));

  if (fresh.length) await upsertRows(config, 'fisio_articles', fresh);
  for (const row of existing) {
    await patchRow(config, 'fisio_articles', `id=eq.${encodeURIComponent(String(row.id))}`, row);
  }
  deps.queue.markPushed({ articleIds: uploaded });
  return uploaded.length;
}

async function pushSettings(config: CloudRestConfig, deps: SyncEngineDeps): Promise<boolean> {
  if (!deps.queue.pending().settingsDirty) return false;
  const settings = deps.readSettings();
  // `updated_at` is NOT NULL timestamptz: an un-stamped device would otherwise
  // post an empty string and the whole row would be rejected with a 400.
  const stamp = settings.updatedAt || new Date().toISOString();
  const row = settingsToRow({ ...settings, updatedAt: stamp }, config.secret);

  const exists = (await selectAll(config, 'fisio_settings', { select: 'workspace_secret' })).length > 0;
  if (exists) {
    await patchRow(
      config,
      'fisio_settings',
      `workspace_secret=eq.${encodeURIComponent(config.secret)}`,
      row
    );
  } else {
    await upsertRows(config, 'fisio_settings', [row]);
  }
  if (!settings.updatedAt) deps.onSettingsStamped?.(stamp);
  deps.queue.markPushed({ settings: true });
  return true;
}

export async function runSyncCycle(deps: SyncEngineDeps): Promise<CycleResult> {
  const config = deps.config();
  if (!config) {
    return {
      pulled: { added: 0, updated: 0 },
      pushed: { articles: 0, settings: false },
      error: NOT_CONFIGURED,
      kind: 'config',
    };
  }

  const result: CycleResult = {
    pulled: { added: 0, updated: 0 },
    pushed: { articles: 0, settings: false },
  };

  const local = await deps.listLocal();

  // ---- Pull ---------------------------------------------------------------
  let cloudRows: GeneratedArticle[] = [];
  try {
    const pulled = await pullArticles(config, deps);
    cloudRows = pulled.cloud;
    const cloudIds = new Set(cloudRows.map((a) => a.id));
    const merged = mergeArticleLists(local, cloudRows);

    for (const id of merged.addedIds) {
      const article = cloudRows.find((candidate) => candidate.id === id);
      if (article) await deps.writeLocal(article);
    }
    for (const id of merged.updatedIds) {
      const article = merged.articles.find((candidate) => candidate.id === id);
      if (article) await deps.writeLocal(article);
    }
    result.pulled = { added: merged.addedIds.length, updated: merged.updatedIds.length };

    // Anything this device has and the cloud does not is a first-time backup;
    // connecting for the first time should upload the existing history rather
    // than only what changes from now on.
    for (const article of local) {
      if (!cloudIds.has(article.id)) deps.queue.addArticle(article.id);
    }
  } catch (err) {
    const { message, kind } = messageOf(err);
    result.error = message;
    result.kind = kind;
    deps.queue.noteFailure(message);
    return result;
  }

  // ---- Settings -----------------------------------------------------------
  try {
    const rows = await selectAll(config, 'fisio_settings', { order: 'updated_at.desc' });
    const cloud = rows.length ? rowToSettings(rows[0]) : null;
    if (cloud) {
      if (chooseSettings(deps.readSettings(), cloud) === 'cloud') deps.applySettings(cloud);
    } else {
      // No settings row yet: this workspace has never received them.
      deps.queue.addSettings();
    }
  } catch (err) {
    const { message, kind } = messageOf(err);
    result.error ??= message;
    result.kind ??= kind;
    deps.queue.noteFailure(message);
    return result;
  }

  // ---- Push ---------------------------------------------------------------
  try {
    await pushDeletes(config, deps);
    result.pushed.articles = await pushArticles(config, deps);
    result.pushed.settings = await pushSettings(config, deps);
    deps.queue.noteSuccess();
  } catch (err) {
    const { message, kind } = messageOf(err);
    result.error ??= message;
    result.kind ??= kind;
    deps.queue.noteFailure(message);
  }

  return result;
}

/**
 * Deletes locally and remotely. A failure to reach the server is not a reason
 * to keep the article on this device, and the tombstone makes sure the next
 * pull will not bring it back.
 */
export async function deleteArticleEverywhere(deps: SyncEngineDeps, id: string): Promise<void> {
  deps.queue.drop(id);
  await deps.tombstones.add(id);
  await deps.removeLocal(id);
  const config = deps.config();
  if (!config) return;
  try {
    await deleteRow(config, 'fisio_articles', 'id', id);
    await deps.tombstones.markSynced(id);
  } catch (err) {
    // Retried by the next cycle's pushDeletes; the local delete already stands.
    console.warn('[cloud] remote delete deferred:', messageOf(err).message);
  }
}

/**
 * Push-only cycle: what a local edit needs. Reading the whole cloud history
 * back after every save would be wasteful, and the merge is one-directional by
 * design — the local write just happened, so it is by definition the newest.
 */
export async function runPushCycle(deps: SyncEngineDeps): Promise<CycleResult> {
  const result: CycleResult = {
    pulled: { added: 0, updated: 0 },
    pushed: { articles: 0, settings: false },
  };
  const config = deps.config();
  if (!config) {
    return { ...result, error: NOT_CONFIGURED, kind: 'config' };
  }
  try {
    await pushDeletes(config, deps);
    result.pushed.articles = await pushArticles(config, deps);
    result.pushed.settings = await pushSettings(config, deps);
    deps.queue.noteSuccess();
  } catch (err) {
    const { message, kind } = messageOf(err);
    result.error = message;
    result.kind = kind;
    deps.queue.noteFailure(message);
  }
  return result;
}

/**
 * Backoff for the retry scheduler: a laptop that just closed its lid should
 * hammer the endpoint three times, not once a second forever.
 */
export function nextRetryDelay(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(2_000 * 2 ** (attempts - 1), 60_000);
}

export interface ConnectionReport {
  ok: boolean;
  message: string;
}

/**
 * A read of the handshake RPC. An empty workspace and a wrong secret both make
 * a plain select return nothing, which is exactly what the handshake counts are
 * there to tell apart — and, honestly, they still cannot be told apart for a
 * workspace that has never been written to, so the message says so.
 */
export async function testCloudConnection(deps: SyncEngineDeps): Promise<ConnectionReport> {
  const config = deps.config();
  if (!config) return { ok: false, message: NOT_CONFIGURED };

  try {
    const result = await handshake(config);
    if (!result.headersExposed) {
      return {
        ok: false,
        message:
          'This Supabase project is not publishing request headers to policies, so the workspace ' +
          'secret cannot be checked. Confirm the schema was applied from supabase/schema.sql and ' +
          'that the project is on a current PostgREST version.',
      };
    }
    if (!result.secretSent) {
      return {
        ok: false,
        message:
          'The request reached Supabase without a workspace secret in it. Save the secret in this ' +
          'panel first — the header is only sent once a secret is stored in this browser.',
      };
    }
    const visible = result.articlesVisible + result.settingsVisible;
    if (visible === 0) {
      return {
        ok: true,
        message:
          `Connected to ${config.url} — this workspace has no saved data yet, ` +
          'so the next sync uploads what is on this device.',
      };
    }
    return {
      ok: true,
      message: `Connected to ${config.url}: ${result.articlesVisible} article(s) and ${result.settingsVisible} settings row(s) visible to this secret.`,
    };
  } catch (err) {
    return { ok: false, message: messageOf(err).message };
  }
}
