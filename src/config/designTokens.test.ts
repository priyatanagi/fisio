import { describe, expect, it } from 'vitest';
import { ALL_TOKENS, TOKEN_GROUPS, previewStyles, readToken, withTokenDefaults } from './designTokens';
import { DEFAULT_USER_PROFILE } from '../types/profile';
import type { DesignRules } from '../types/profile';
import { buildDesignTokenBlock } from '../server/agentPrompts';

const base: DesignRules = DEFAULT_USER_PROFILE.designRules;

describe('token catalog', () => {
  it('covers every style area the article can contain', () => {
    const keys = ALL_TOKENS.map((t) => t.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'textColor',
        'headingFont', 'bodyFont', 'bodyStyle', 'headingStyle',
        'hyperlinkStyle', 'bulletStyle', 'numberingStyle', 'imageStyle', 'codeStyle',
        'blockquoteStyle', 'tableStyle', 'faqStyle', 'buttonStyle',
      ])
    );
  });

  it('gives every token a non-empty label and hint', () => {
    for (const token of ALL_TOKENS) {
      expect(token.label.length).toBeGreaterThan(0);
      expect(token.hint.length).toBeGreaterThan(0);
      expect(token.fallback.length).toBeGreaterThan(0);
    }
  });

  it('groups tokens into the four style categories', () => {
    expect(TOKEN_GROUPS.map((g) => g.id)).toEqual(['color', 'typography', 'components', 'blocks']);
  });

  it('has no duplicate keys across groups', () => {
    const keys = ALL_TOKENS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('readToken / withTokenDefaults', () => {
  it('falls back for a profile saved before a token existed', () => {
    const token = ALL_TOKENS.find((t) => t.key === 'faqStyle')!;
    expect(readToken(base, token)).toBe(token.fallback);
  });

  it('keeps a value the user actually chose', () => {
    const chosen = { ...base, faqStyle: 'card' };
    const token = ALL_TOKENS.find((t) => t.key === 'faqStyle')!;
    expect(readToken(chosen, token)).toBe('card');
  });

  it('ignores a blank value rather than propagating it', () => {
    const token = ALL_TOKENS.find((t) => t.key === 'tableStyle')!;
    expect(readToken({ ...base, tableStyle: '   ' }, token)).toBe(token.fallback);
  });

  it('fills every token without discarding existing choices', () => {
    const filled = withTokenDefaults({ ...base, primaryColor: '#123456' } as DesignRules);
    expect(filled.primaryColor).toBe('#123456');
    for (const token of ALL_TOKENS) {
      expect(typeof (filled as unknown as Record<string, unknown>)[token.key]).toBe('string');
    }
  });
});

describe('previewStyles reflects each choice', () => {
  const styles = (rules: Partial<DesignRules>) =>
    previewStyles(withTokenDefaults({ ...base, ...rules } as DesignRules));

  it('applies the palette to the page', () => {
    expect(styles({ primaryColor: '#ff0000' }).link).toMatchObject({ color: '#ff0000' });
  });

  it('changes underline behaviour for the hyperlink token', () => {
    expect(styles({ hyperlinkStyle: 'underline' }).link).toMatchObject({
      textDecoration: 'underline',
    });
    expect(styles({ hyperlinkStyle: 'boxed' }).link).toMatchObject({ background: expect.any(String) });
  });

  it('changes list markers for bullets and numbering', () => {
    expect(styles({ bulletStyle: 'square' }).bullet).toMatchObject({ listStyleType: 'square' });
    expect(styles({ numberingStyle: 'lower-roman' }).number).toMatchObject({
      listStyleType: 'lower-roman',
    });
  });

  it('changes the image frame', () => {
    expect(styles({ imageStyle: 'plain' }).frame.borderRadius).toBeUndefined();
    expect(styles({ imageStyle: 'rounded' }).frame.borderRadius).toBe('10px');
  });

  it('changes table treatment', () => {
    expect(styles({ tableStyle: 'header-fill' }).head.background).toBeDefined();
    expect(styles({ tableStyle: 'bordered' }).cell.border).toBeDefined();
  });

  it('changes blockquote treatment', () => {
    expect(styles({ blockquoteStyle: 'card' }).quote.borderRadius).toBe('8px');
    expect(styles({ blockquoteStyle: 'centered' }).quote.textAlign).toBe('center');
  });

  it('changes faq treatment', () => {
    expect(styles({ faqStyle: 'card' }).faqItem.borderRadius).toBe('8px');
    expect(styles({ faqStyle: 'divided' }).faqItem.borderTop).toBeDefined();
  });

  it('changes button radius', () => {
    expect(styles({ buttonStyle: 'pill' }).button.borderRadius).toBe('999px');
  });
});

describe('buildDesignTokenBlock carries the new tokens', () => {
  it('emits every palette value', () => {
    const block = buildDesignTokenBlock(DEFAULT_USER_PROFILE.designRules);
    expect(block).toContain('#cc2929');
    expect(block).toContain('#f8fafc');
    expect(block).toContain('#333940');
  });

  it('names every configurable element style in human terms', () => {
    const block = buildDesignTokenBlock(DEFAULT_USER_PROFILE.designRules);
    for (const phrase of ['Body copy', 'Headings', 'Link', 'Bullets', 'Numbering',
      'Image frame', 'Code', 'Table', 'FAQ', 'Blockquote', 'Button']) {
      expect(block).toContain(phrase);
    }
  });

  it('instructs the model to express styles as inline CSS', () => {
    expect(buildDesignTokenBlock(base)).toMatch(/inline/i);
  });

  it('resolves defaults for a profile predating the tokens', () => {
    const legacy = { primaryColor: '#111111', secondaryColor: '#222222', accentColor: '#333333',
      backgroundColor: '#444444', textColor: '#555555', headingFont: 'Arial', bodyFont: 'Arial',
      buttonStyle: 'rounded', blockquoteStyle: 'plain' } as DesignRules;
    const block = buildDesignTokenBlock(legacy);
    expect(block).toContain('FAQ');
    expect(block).not.toContain('undefined');
  });
});