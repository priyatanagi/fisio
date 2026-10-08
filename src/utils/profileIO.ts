/**
 * Profile file exchange and the per-section reset scope.
 *
 * Both halves are pure so the destructive ones are testable: an import must
 * refuse a JSON file that merely happens to parse, and a reset must touch only
 * the section the user is looking at — the old button cleared all four at once
 * with no confirmation.
 */
import type { FormatOverrides } from '../config/brandPresets';
import type { UniversalRules } from '../config/universalRules';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';
import type { UserProfile } from '../types/profile';
import { DEFAULT_USER_PROFILE } from '../types/profile';
import { sanitizeProfile } from '../sync/syncMerge';

export const PROFILE_FILE_KIND = 'fisio-profile';

export const SAMPLE_PROFILE: UserProfile = {
  businessName: 'Klinik Sehat Sentosa',
  niche: 'Klinik fisioterapi dan rehabilitas',
  location: 'Jakarta Selatan, Indonesia',
  targetMarket: 'Karyawan kantoran usia 25-45 tahun dengan keluhan nyeri punggung',
  usp: 'Terapi manual dikombinasikan dengan latihan rehabilitasi berbasis bukti.',
  toneOfVoice: 'Profesional, hangat, dan mudah dipahami',
  defaultCta: 'Jadwalkan konsultasi fisioterapi pertama Anda hari ini.',
  designRules: {
    primaryColor: '#0d9488',
    secondaryColor: '#134e4a',
    accentColor: '#f59e0b',
    backgroundColor: '#f8fafc',
    textColor: '#1f2937',
    headingFont: '"Plus Jakarta Sans", system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    textAlignment: 'left',
    buttonStyle: 'rounded',
    blockquoteStyle: 'accent-bar',
    bodyStyle: 'readable',
    headingStyle: 'strong',
    hyperlinkStyle: 'underline',
    bulletStyle: 'disc',
    numberingStyle: 'decimal',
    imageStyle: 'rounded',
    codeStyle: 'subtle',
    tableStyle: 'header-fill',
    faqStyle: 'divided',
  },
  exclusions: [
    'EXCLUDE voucher and discount searches ("diskon fisioterapi", "promo gratis") — position on clinical outcomes, not price.',
    'EXCLUDE acute emergency searches ("fisioterapi emergency 24 jam") — refer those cases to a hospital.',
  ],
};

const PROFILE_KEYS: (keyof UserProfile)[] = [
  'businessName',
  'niche',
  'location',
  'targetMarket',
  'usp',
  'toneOfVoice',
  'defaultCta',
  'designRules',
  'exclusions',
  'formatOverrides',
];

export function profileToJson(profile: UserProfile): string {
  return JSON.stringify(
    {
      kind: PROFILE_FILE_KIND,
      version: 1,
      exportedAt: new Date().toISOString(),
      profile,
    },
    null,
    2
  );
}

export type ParseResult =
  | { ok: true; profile: UserProfile }
  | { ok: false; error: string };

/**
 * Accepts both our own export envelope and a bare profile object (hand-written
 * or produced by an older build), and rejects anything that is not a profile at
 * all rather than filling the form with defaults.
 */
export function parseProfileJson(text: string): ParseResult {
  if (!text.trim()) return { ok: false, error: 'The file is empty.' };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That is not valid JSON.' };
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Expected a JSON object with profile fields.' };
  }

  const record = raw as Record<string, unknown>;
  const candidate =
    record.profile && typeof record.profile === 'object'
      ? (record.profile as Record<string, unknown>)
      : record;
  const isEnvelope = record.profile && typeof record.profile === 'object';

  if (!isEnvelope && !PROFILE_KEYS.some((key) => key in candidate)) {
    return {
      ok: false,
      error: 'No profile fields found — expected a Fisio Architect profile export.',
    };
  }

  const profile = sanitizeProfile(candidate);
  if (!profile) return { ok: false, error: 'The profile inside that file could not be read.' };
  return { ok: true, profile };
}

export type ProfileSection = 'business' | 'brand' | 'design' | 'rules';

export interface SectionState {
  profile: UserProfile;
  overrides: FormatOverrides;
  rules: UniversalRules;
}

/** What each tab owns, in the words the confirm dialog shows. */
export const PROFILE_SECTION_LABELS: Record<ProfileSection, string> = {
  business: 'Business details',
  brand: 'Brand kit and its per-format overrides',
  design: 'Design tokens',
  rules: 'Content rules — exclusions and writing/SEO numbers',
};

/** The plain copy blocks — everything else on a profile is a token list or array. */
type TextKey =
  | 'businessName'
  | 'niche'
  | 'location'
  | 'targetMarket'
  | 'usp'
  | 'toneOfVoice'
  | 'defaultCta';

const TEXT_FIELDS: TextKey[] = [
  'businessName',
  'niche',
  'location',
  'targetMarket',
  'usp',
  'toneOfVoice',
  'defaultCta',
];

/**
 * What one tab owns, and nothing more. Business touches only the copy blocks;
 * the kit tabs own the tokens; Content rules owns the exclusions and the
 * numbers. `overrides` reset only with the Brand kit tab because that is the
 * panel that edits them.
 */
export function resetProfileSection(section: ProfileSection, state: SectionState): SectionState & { label: string } {
  const { profile, overrides, rules } = state;
  const label = PROFILE_SECTION_LABELS[section];

  switch (section) {
    case 'business': {
      const next = { ...profile };
      for (const key of TEXT_FIELDS) {
        next[key] = DEFAULT_USER_PROFILE[key];
      }
      return { profile: next, overrides, rules, label };
    }
    case 'brand':
      return {
        profile: { ...profile, designRules: { ...DEFAULT_USER_PROFILE.designRules } },
        overrides: {},
        rules,
        label,
      };
    case 'design':
      return {
        profile: { ...profile, designRules: { ...DEFAULT_USER_PROFILE.designRules } },
        overrides,
        rules,
        label,
      };
    case 'rules':
      return {
        profile: { ...profile, exclusions: [...DEFAULT_USER_PROFILE.exclusions] },
        overrides,
        rules: { ...DEFAULT_UNIVERSAL_RULES },
        label,
      };
  }
}
