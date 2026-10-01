import { LEGACY_EXCLUSIONS } from '../config/universalRules';

export interface DesignRules {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  buttonStyle: 'rounded' | 'square' | 'pill';
  blockquoteStyle: 'accent-bar' | 'card' | 'plain';
}

export interface UserProfile {
  businessName: string;
  niche: string;
  location: string;
  targetMarket: string;
  usp: string;
  toneOfVoice: string;
  defaultCta: string;
  designRules: DesignRules;
  exclusions: string[];
}

// Empty strings mean "not configured". Prompts fall back to FALLBACK_BRAND so
// the app behaves as it did before profiles existed; the nav rail surfaces a
// warning chip so that fallback is never silent.
export const DEFAULT_USER_PROFILE: UserProfile = {
  businessName: '',
  niche: '',
  location: '',
  targetMarket: '',
  usp: '',
  toneOfVoice: '',
  defaultCta: '',
  designRules: {
    primaryColor: '#cc2929',
    secondaryColor: '#1a1d20',
    accentColor: '#cc2929',
    backgroundColor: '#f8fafc',
    textColor: '#333940',
    headingFont: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    bodyFont: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    buttonStyle: 'rounded',
    blockquoteStyle: 'accent-bar',
  },
  exclusions: [...LEGACY_EXCLUSIONS],
};

// These values reproduce the pre-profile app's output exactly.
export const FALLBACK_BRAND = {
  businessName: 'RealleaderUSA',
  niche: 'Commercial gym equipment supplier and facility planning',
  location: 'Indonesia and global B2B markets',
  targetMarket:
    'Gym owners and commercial investors, five-star hotels and resorts, premium apartments and condominiums, international and premium schools, corporate and hospital wellness programmes, and early-stage facility planners.',
  usp:
    'Commercial-grade biomechanics equipment in matte powder-coated steel, with warranty support, 2D/3D facility layout planning, installation, and after-sales service.',
  toneOfVoice: 'Professional, authoritative, consultative, ROI-driven, and easy to read.',
  defaultCta:
    'Request a quotation for facility layout planning, 2D/3D floor planning, and the commercial catalogue.',
} as const;

export function isProfileConfigured(profile: UserProfile): boolean {
  return Boolean(
    profile.businessName.trim() &&
      profile.niche.trim() &&
      profile.targetMarket.trim() &&
      profile.toneOfVoice.trim()
  );
}

export function resolveProfile(
  profile: UserProfile
): Pick<
  UserProfile,
  | 'businessName'
  | 'niche'
  | 'location'
  | 'targetMarket'
  | 'usp'
  | 'toneOfVoice'
  | 'defaultCta'
> {
  const pick = (value: string, fallback: string) => (value.trim() ? value.trim() : fallback);
  return {
    businessName: pick(profile.businessName, FALLBACK_BRAND.businessName),
    niche: pick(profile.niche, FALLBACK_BRAND.niche),
    location: pick(profile.location, FALLBACK_BRAND.location),
    targetMarket: pick(profile.targetMarket, FALLBACK_BRAND.targetMarket),
    usp: pick(profile.usp, FALLBACK_BRAND.usp),
    toneOfVoice: pick(profile.toneOfVoice, FALLBACK_BRAND.toneOfVoice),
    defaultCta: pick(profile.defaultCta, FALLBACK_BRAND.defaultCta),
  };
}
