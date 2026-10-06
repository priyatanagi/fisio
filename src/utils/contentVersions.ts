import type { ContentVersion, OutputFormatId } from '../types/article';
import { formatVersionStamp } from './metadataVersions';

/**
 * Snapshots are saved by hand, but the cap keeps a long editing session from
 * growing the article record without bound. Beyond it the oldest entries fall
 * off; version numbers keep climbing regardless, so one still names one entry.
 */
export const CONTENT_VERSION_CAP = 50;

/** Record the buffer as the next version. Blank labels fall back to a timestamp. */
export function appendContentVersion(
  versions: ContentVersion[] | undefined,
  html: string,
  format: OutputFormatId,
  options: { label?: string; savedAt?: string } = {}
): ContentVersion[] {
  const list = versions ?? [];
  const version = Math.max(0, ...list.map((entry) => entry.version)) + 1;
  const savedAt = options.savedAt ?? new Date().toISOString();
  const label = options.label?.trim() || `Edited ${formatVersionStamp(savedAt)}`;
  const next = [...list, { version, label, savedAt, format, html }];
  return next.length > CONTENT_VERSION_CAP ? next.slice(-CONTENT_VERSION_CAP) : next;
}

/**
 * The snapshot a restore puts back, plus the history with the restore recorded
 * as a new entry — the same readable-sequence behaviour as metadata restores.
 */
export function restoreContentVersion(
  versions: ContentVersion[] | undefined,
  version: number
): { html: string; format: OutputFormatId; versions: ContentVersion[] } | null {
  const found = (versions ?? []).find((entry) => entry.version === version);
  if (!found) return null;
  return {
    html: found.html,
    format: found.format,
    versions: appendContentVersion(versions, found.html, found.format, {
      label: `Restored v${version}`,
    }),
  };
}

/** The history relevant to one editor format; other formats' snapshots stay out of the list. */
export function contentVersionsFor(
  versions: ContentVersion[] | undefined,
  format: OutputFormatId
): ContentVersion[] {
  return (versions ?? []).filter((entry) => entry.format === format);
}
