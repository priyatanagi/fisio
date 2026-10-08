/**
 * Contrast repair: what to change, not just what is wrong.
 *
 * A failing palette is almost always one colour out of reach, so the fix walks
 * that colour's lightness until the pairing clears WCAG AA and stops. Hue and
 * saturation are held: `#cc2929` becoming `#a31f1f` is still the brand's red,
 * while `#cc2929` becoming `#000000` would be a different company. The page
 * background is never moved — it is the surface the whole kit was chosen against.
 */
import type { DesignRules } from '../types/profile';
import { withTokenDefaults } from './designTokens';
import { contrastRatio, isHex, readingPairs } from './tokenContrast';

export interface ContrastFix {
  token: keyof DesignRules;
  from: string;
  to: string;
  /** Pairing labels this single change repairs. */
  repairs: string[];
  /** True when the colour was pushed darker; the UI words it accordingly. */
  darkened: boolean;
  achieved: number;
  required: number;
}

export interface ContrastRepair {
  fixes: ContrastFix[];
  /** The palette with every proposed fix applied. */
  rules: DesignRules;
  /** Pairings still below AA afterwards — unmeasurable or simply unreachable. */
  unresolved: string[];
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function toHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value + m)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function toHsl(hex: string): Hsl | null {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/**
 * The closest lightness to the original that clears the target ratio. Searching
 * outward from the current value is what keeps a brand colour recognisable: a
 * red that only needs to lose 8% of its lightness is not rewritten wholesale.
 */
function reachableColor(from: string, against: string, required: number): { to: string; ratio: number } | null {
  const hsl = toHsl(from);
  if (!hsl) return null;
  for (let step = 1; step <= 100; step++) {
    for (const direction of [-1, 1]) {
      const l = hsl.l + (direction * step) / 100;
      if (l < 0 || l > 1) continue;
      const candidate = toHex(hsl.h, hsl.s, l);
      const ratio = contrastRatio(candidate, against);
      if (ratio >= required) return { to: candidate, ratio };
    }
  }
  return null;
}

export function suggestContrastFixes(rules: DesignRules): ContrastRepair {
  const original = withTokenDefaults(rules) as unknown as Record<string, string>;
  const working = { ...original };
  const fixes: ContrastFix[] = [];
  const unresolved: string[] = [];

  // Sequential: one colour can carry two pairings (the primary is both the link
  // colour and the button surface), and fixing it once should satisfy both.
  for (const pair of readingPairs(original as unknown as DesignRules)) {
    const current = working[pair.mutable];
    const against = working[pair.fixed];
    // Measured before the ratio test: a colour someone typed as `red` has no
    // lightness to walk, and scoring it as black would report it as passing.
    if (!isHex(current) || !isHex(against)) {
      unresolved.push(pair.label);
      continue;
    }

    if (contrastRatio(current, against) >= pair.required) {
      // Credit an earlier fix that also cleared this pairing, so the panel can
      // say what one colour change actually bought.
      const failedToBeginWith = contrastRatio(original[pair.mutable], original[pair.fixed]) < pair.required;
      const credited = fixes.find((fix) => fix.token === pair.mutable);
      if (failedToBeginWith && credited && !credited.repairs.includes(pair.label)) {
        credited.repairs.push(pair.label);
      }
      continue;
    }

    const found = reachableColor(current, against, pair.required);
    if (!found) {
      unresolved.push(pair.label);
      continue;
    }

    const existing = fixes.find((fix) => fix.token === pair.mutable);
    if (existing) {
      existing.repairs.push(pair.label);
      existing.achieved = Math.min(existing.achieved, found.ratio);
    } else {
      const fromHsl = toHsl(current);
      const toHslValue = toHsl(found.to);
      fixes.push({
        token: pair.mutable,
        from: current,
        to: found.to,
        repairs: [pair.label],
        darkened: !!fromHsl && !!toHslValue && toHslValue.l < fromHsl.l,
        achieved: Math.round(found.ratio * 100) / 100,
        required: pair.required,
      });
    }
    working[pair.mutable] = found.to;
  }

  return { fixes, rules: working as unknown as DesignRules, unresolved };
}
