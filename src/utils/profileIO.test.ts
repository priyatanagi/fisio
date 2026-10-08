import { describe, expect, it } from 'vitest';
import {
  SAMPLE_PROFILE,
  parseProfileJson,
  profileToJson,
  resetProfileSection,
} from './profileIO';
import { DEFAULT_USER_PROFILE } from '../types/profile';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';

describe('profileToJson / parseProfileJson', () => {
  it('round-trips a profile without losing design tokens or exclusions', () => {
    const parsed = parseProfileJson(profileToJson(SAMPLE_PROFILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.profile.businessName).toBe(SAMPLE_PROFILE.businessName);
    expect(parsed.profile.designRules.primaryColor).toBe('#0d9488');
    // Element tokens live outside the nine base fields; an earlier sanitizer
    // dropped them silently, which gutted a profile on import.
    expect(parsed.profile.designRules.tableStyle).toBe('header-fill');
    expect(parsed.profile.designRules.faqStyle).toBe('divided');
    expect(parsed.profile.exclusions).toHaveLength(SAMPLE_PROFILE.exclusions.length);
  });

  it('reports readable errors instead of throwing on junk input', () => {
    expect(parseProfileJson('').ok).toBe(false);
    expect(parseProfileJson('{ not json').ok).toBe(false);
    const notAnObject = parseProfileJson('[1,2,3]');
    expect(notAnObject.ok).toBe(false);
    if (!notAnObject.ok) expect(notAnObject.error).toContain('object');
  });

  it('accepts a partial file and fills the blanks from the defaults', () => {
    const parsed = parseProfileJson(JSON.stringify({ businessName: 'Toko Fitness Baru' }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.profile.businessName).toBe('Toko Fitness Baru');
    expect(parsed.profile.niche).toBe(DEFAULT_USER_PROFILE.niche);
    expect(parsed.profile.designRules.buttonStyle).toBe(DEFAULT_USER_PROFILE.designRules.buttonStyle);
  });

  it('keeps per-format overrides when they are shaped correctly, drops them when not', () => {
    const good = parseProfileJson(
      JSON.stringify({ ...SAMPLE_PROFILE, formatOverrides: { 'clean-en': { primaryColor: '#111111' } } })
    );
    expect(good.ok && good.profile.formatOverrides?.['clean-en'].primaryColor).toBe('#111111');

    const bad = parseProfileJson(JSON.stringify({ ...SAMPLE_PROFILE, formatOverrides: 'nope' }));
    expect(bad.ok).toBe(true);
    if (bad.ok) expect(bad.profile.formatOverrides).toBeUndefined();
  });

  it('marks the exported file so an unrelated JSON is not accepted silently', () => {
    const parsed = parseProfileJson(JSON.stringify({ hello: 'world' }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('profile');
  });
});

describe('resetProfileSection', () => {
  const current = {
    profile: SAMPLE_PROFILE,
    overrides: { 'clean-en': { primaryColor: '#abcdef' } },
    rules: { ...DEFAULT_UNIVERSAL_RULES, maxSentenceWords: 32 },
  };

  it('Business clears only the brand text fields', () => {
    const next = resetProfileSection('business', current);
    expect(next.profile.businessName).toBe('');
    // Design tokens, exclusions and overrides belong to other tabs and stay put.
    expect(next.profile.designRules.primaryColor).toBe('#0d9488');
    expect(next.profile.exclusions).toEqual(SAMPLE_PROFILE.exclusions);
    expect(next.overrides).toEqual(current.overrides);
    expect(next.rules).toEqual(current.rules);
  });

  it('Brand kit resets the tokens and the per-format overrides together', () => {
    const next = resetProfileSection('brand', current);
    expect(next.profile.designRules.primaryColor).toBe(DEFAULT_USER_PROFILE.designRules.primaryColor);
    expect(next.overrides).toEqual({});
    // A kit swap says nothing about the copy blocks or the business text.
    expect(next.profile.businessName).toBe(SAMPLE_PROFILE.businessName);
    expect(next.rules).toEqual(current.rules);
  });

  it('Design & preview resets the tokens but keeps the overrides', () => {
    const next = resetProfileSection('design', current);
    expect(next.profile.designRules.primaryColor).toBe(DEFAULT_USER_PROFILE.designRules.primaryColor);
    expect(next.overrides).toEqual(current.overrides);
  });

  it('Content rules resets exclusions and the writing/SEO numbers', () => {
    const next = resetProfileSection('rules', current);
    expect(next.profile.exclusions).toEqual(DEFAULT_USER_PROFILE.exclusions);
    expect(next.rules).toEqual(DEFAULT_UNIVERSAL_RULES);
    expect(next.profile.businessName).toBe(SAMPLE_PROFILE.businessName);
  });

  it('names the section so the confirm dialog can be specific', () => {
    expect(resetProfileSection('business', current).label).toMatch(/business/i);
    expect(resetProfileSection('rules', current).label).toMatch(/rule/i);
  });
});
