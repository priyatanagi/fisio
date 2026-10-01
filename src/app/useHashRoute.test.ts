import { describe, it, expect } from 'vitest';
import { parseHash, ROUTES } from './useHashRoute';

describe('parseHash', () => {
  it('maps every known route', () => {
    for (const route of ROUTES) {
      expect(parseHash(`#/${route}`)).toBe(route);
    }
  });

  it('defaults to generate for empty or unknown values', () => {
    expect(parseHash('')).toBe('generate');
    expect(parseHash('#/')).toBe('generate');
    expect(parseHash('#/nonsense')).toBe('generate');
  });

  it('accepts a bare route name without the slash', () => {
    expect(parseHash('#batch')).toBe('batch');
  });

  it('exposes exactly five routes', () => {
    expect(ROUTES).toHaveLength(5);
  });
});
