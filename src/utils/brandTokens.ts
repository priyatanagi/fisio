import type { DesignRules } from '../types/profile';

export interface BrandWarning {
  hex: string;
  occurrences: number;
}

// The five values hardcoded in the pre-profile prompts, mapped to their
// profile equivalents so a Designer run that echoes the old palette still
// comes out on-brand.
type ColorRuleKey =
  | 'primaryColor'
  | 'secondaryColor'
  | 'accentColor'
  | 'backgroundColor'
  | 'textColor';

const LEGACY_MAP: Record<string, ColorRuleKey> = {
  '#cc2929': 'primaryColor',
  '#1a1d20': 'secondaryColor',
  '#333940': 'textColor',
  '#f8fafc': 'backgroundColor',
  '#e2e8f0': 'primaryColor',
};

const CUSTOM_PROPERTY_MAP: Record<string, ColorRuleKey> = {
  '--primary': 'primaryColor',
  '--accent': 'accentColor',
  '--dark': 'secondaryColor',
  '--slate': 'textColor',
  '--bg-neutral': 'backgroundColor',
  '--border': 'primaryColor',
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

function rgbDistance(a: string, b: string): number {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return (ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2;
}

export function applyBrandTokens(
  html: string,
  rules: DesignRules,
  options: { forcePalette?: boolean } = {}
): { html: string; warnings: BrandWarning[] } {
  const palette = [
    rules.primaryColor,
    rules.secondaryColor,
    rules.accentColor,
    rules.backgroundColor,
    rules.textColor,
  ].map((c) => c.toLowerCase());

  let output = html;

  // Pass 1: CSS custom properties.
  for (const [property, ruleKey] of Object.entries(CUSTOM_PROPERTY_MAP)) {
    const value = rules[ruleKey];
    const pattern = new RegExp(`(${property}\\s*:\\s*)(#[0-9a-fA-F]{3,8})`, 'g');
    output = output.replace(pattern, `$1${value}`);
  }

  // Pass 2: legacy hex values. Escaped so a hex inside a character class or
  // quantifier in the generated RegExp cannot be misread as syntax.
  for (const [legacy, ruleKey] of Object.entries(LEGACY_MAP)) {
    const value = rules[ruleKey];
    output = output.replace(new RegExp(legacy.replace('#', '\\#'), 'gi'), value);
  }

  // Pass 3: off-palette detection.
  const found = new Map<string, number>();
  for (const match of output.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = match[0].toLowerCase();
    if (!palette.includes(hex)) {
      found.set(hex, (found.get(hex) ?? 0) + 1);
    }
  }
  const warnings: BrandWarning[] = [...found.entries()].map(([hex, occurrences]) => ({
    hex,
    occurrences,
  }));

  if (options.forcePalette && warnings.length > 0) {
    for (const warning of warnings) {
      const nearest = palette.reduce((best, candidate) =>
        rgbDistance(warning.hex, candidate) < rgbDistance(warning.hex, best) ? candidate : best
      );
      output = output.replace(new RegExp(warning.hex.replace('#', '\\#'), 'gi'), nearest);
    }
  }

  return { html: output, warnings };
}
