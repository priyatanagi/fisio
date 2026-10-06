import type { MetadataVersion, SeoMetadata } from '../types/article';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * A human timestamp with the date and the hour, because that is what tells two
 * versions of the same metadata apart when they were saved minutes apart.
 */
export function formatVersionStamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'unknown time';
  return `${pad(at.getDate())} ${MONTHS[at.getMonth()]} ${at.getFullYear()}, ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function clone(metadata: SeoMetadata): SeoMetadata {
  return { ...metadata, tags: [...(metadata.tags ?? [])] };
}

/**
 * Version 1 is the metadata the pipeline produced, stamped with when the
 * article was generated. Everything the user saves afterwards is a new version
 * on top of it, so the original output is never lost.
 */
export function seedMetadataVersions(
  metadata: SeoMetadata,
  generatedAt: string
): MetadataVersion[] {
  return [
    {
      version: 1,
      label: 'Original output',
      savedAt: generatedAt,
      metadata: clone(metadata),
    },
  ];
}

/**
 * The history to work from. An article saved before versioning existed has none,
 * so its own metadata becomes version 1 rather than starting the list empty.
 */
export function versionsFor(
  versions: MetadataVersion[] | undefined,
  metadata: SeoMetadata,
  generatedAt: string
): MetadataVersion[] {
  return versions?.length ? versions : seedMetadataVersions(metadata, generatedAt);
}

/** Record the current metadata as the next version. */
export function appendMetadataVersion(
  versions: MetadataVersion[],
  metadata: SeoMetadata,
  options: { label?: string; savedAt?: string } = {}
): MetadataVersion[] {
  const version = Math.max(0, ...versions.map((v) => v.version)) + 1;
  const savedAt = options.savedAt ?? new Date().toISOString();
  const label = options.label?.trim() || `Edited ${formatVersionStamp(savedAt)}`;
  return [...versions, { version, label, savedAt, metadata: clone(metadata) }];
}

/**
 * The metadata a restore puts back. Restoring also records a new version, so the
 * sequence of edits stays readable instead of silently rewriting history.
 */
export function restoreMetadataVersion(
  versions: MetadataVersion[],
  version: number
): { metadata: SeoMetadata; versions: MetadataVersion[] } | null {
  const found = versions.find((entry) => entry.version === version);
  if (!found) return null;
  return {
    metadata: clone(found.metadata),
    versions: appendMetadataVersion(versions, found.metadata, {
      label: `Restored v${version}`,
    }),
  };
}

/** What actually differs between a version and the metadata in play. */
export function metadataDiff(
  version: SeoMetadata,
  current: SeoMetadata
): { field: string; from: string; to: string }[] {
  const fields: { field: string; key: keyof SeoMetadata; join?: (value: unknown) => string }[] = [
    { field: 'SEO Title', key: 'seoTitle' },
    { field: 'Headline', key: 'headline' },
    { field: 'Focus Keyphrase', key: 'focusKeyphrase' },
    { field: 'Meta Description', key: 'metaDescription' },
    { field: 'URL Slug', key: 'urlSlug' },
    { field: 'Tags', key: 'tags', join: (value) => (Array.isArray(value) ? value.join(', ') : String(value ?? '')) },
  ];
  return fields
    .map(({ field, key, join }) => {
      const read = (source: SeoMetadata): string =>
        join ? join(source[key]) : String(source[key] ?? '');
      const from = read(version);
      const to = read(current);
      return { field, from, to };
    })
    .filter((entry) => entry.from !== entry.to);
}