import { describe, it, expect } from 'vitest';
import { validateRoleOutput, buildRepairPrompt } from './roleSchemas';

const judge = {
  refinedTopic: 'Why gym ROI falls in year two',
  searchIntent: 'commercial',
  audienceAngle: 'framed for owners',
  subtopics: ['a', 'b'],
  rejectedAngles: [{ angle: 'x', reason: 'y' }],
};

describe('validateRoleOutput: judge', () => {
  it('accepts a well-formed object', () => {
    expect(validateRoleOutput('judge', JSON.stringify(judge)).ok).toBe(true);
  });

  it('tolerates a missing rejectedAngles array', () => {
    const { rejectedAngles, ...rest } = judge;
    const result = validateRoleOutput('judge', JSON.stringify(rest));
    expect(result.ok).toBe(true);
    expect((result as any).data.rejectedAngles).toEqual([]);
  });

  it('tolerates null values inside arrays', () => {
    const messy = JSON.stringify({ ...judge, subtopics: ['a', null, 'b'] });
    expect(validateRoleOutput('judge', messy).ok).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(validateRoleOutput('judge', '').ok).toBe(false);
  });

  it('rejects non-JSON', () => {
    expect(validateRoleOutput('judge', 'sorry, I cannot').ok).toBe(false);
  });

  it('strips markdown fences before parsing', () => {
    const fenced = '```json\n' + JSON.stringify(judge) + '\n```';
    expect(validateRoleOutput('judge', fenced).ok).toBe(true);
  });

  it('rejects output missing refinedTopic', () => {
    const { refinedTopic, ...rest } = judge;
    expect(validateRoleOutput('judge', JSON.stringify(rest)).ok).toBe(false);
  });

  it('defaults an unrecognised searchIntent to informational', () => {
    const bad = JSON.stringify({ ...judge, searchIntent: 'nonsense' });
    expect((validateRoleOutput('judge', bad) as any).data.searchIntent).toBe('informational');
  });
});

describe('validateRoleOutput: impower', () => {
  it('always succeeds and fills missing arrays', () => {
    const result = validateRoleOutput('impower', JSON.stringify({ seoMetadata: { seoTitle: 'T' } }));
    expect(result.ok).toBe(true);
    const data = (result as any).data;
    expect(data.outline).toEqual([]);
    expect(data.secondaryKeywords).toEqual([]);
    expect(data.source).toBe('impower');
  });

  it('keeps plain-string list fields untouched', () => {
    const result = validateRoleOutput(
      'impower',
      JSON.stringify({
        seoMetadata: { seoTitle: 'T', tags: ['b2b', 'gym'] },
        secondaryKeywords: ['equipment', 'maintenance'],
        internalLinkTargets: ['/blog/inspection'],
      })
    );
    const data = (result as any).data;
    expect(data.seoMetadata.tags).toEqual(['b2b', 'gym']);
    expect(data.secondaryKeywords).toEqual(['equipment', 'maintenance']);
    expect(data.internalLinkTargets).toEqual(['/blog/inspection']);
  });

  it('recovers object-shaped link targets instead of dropping them', () => {
    // ornith:9b emits these as objects; a strict string filter lost them all.
    const result = validateRoleOutput(
      'impower',
      JSON.stringify({
        seoMetadata: { seoTitle: 'T' },
        internalLinkTargets: [
          { anchorText: 'equipment warranty', relevanceScore: 'high', context: 'vendor section' },
          { anchorText: 'safety checklist', relevanceScore: 'medium' },
        ],
      })
    );
    expect((result as any).data.internalLinkTargets).toEqual([
      'equipment warranty',
      'safety checklist',
    ]);
  });

  it('recovers object-shaped tags and keywords', () => {
    const result = validateRoleOutput(
      'impower',
      JSON.stringify({
        seoMetadata: { seoTitle: 'T', tags: [{ name: 'gym ops' }, 'plain'] },
        secondaryKeywords: [{ text: 'treadmill repair' }],
      })
    );
    const data = (result as any).data;
    expect(data.seoMetadata.tags).toEqual(['gym ops', 'plain']);
    expect(data.secondaryKeywords).toEqual(['treadmill repair']);
  });

  it('drops entries with no usable text rather than emitting blanks', () => {
    const result = validateRoleOutput(
      'impower',
      JSON.stringify({
        seoMetadata: { seoTitle: 'T' },
        internalLinkTargets: [{ irrelevant: 'x' }, 'keep me', '', null],
      })
    );
    expect((result as any).data.internalLinkTargets).toEqual(['keep me']);
  });
});

describe('validateRoleOutput: creator', () => {
  it('requires markdownContent', () => {
    expect(validateRoleOutput('creator', JSON.stringify({})).ok).toBe(false);
  });

  it('tags a selfPlanned payload as creator-selfplanned', () => {
    const raw = JSON.stringify({
      markdownContent: '# T',
      selfPlanned: { seoMetadata: { seoTitle: 'T' } },
    });
    expect((validateRoleOutput('creator', raw) as any).data.selfPlanned.source).toBe(
      'creator-selfplanned'
    );
  });
});

describe('validateRoleOutput: reviewer', () => {
  it('requires a verdict', () => {
    expect(validateRoleOutput('reviewer', JSON.stringify({ seoScore: 80 })).ok).toBe(false);
  });

  it('accepts pass with no issues', () => {
    expect(
      validateRoleOutput('reviewer', JSON.stringify({ verdict: 'pass', seoScore: 90 })).ok
    ).toBe(true);
  });

  it('defaults a missing seoScore to 0', () => {
    const result = validateRoleOutput('reviewer', JSON.stringify({ verdict: 'revise' }));
    expect(result.ok).toBe(true);
    expect((result as any).data.seoScore).toBe(0);
  });

  it('defaults a missing issues array to an empty one', () => {
    const result = validateRoleOutput('reviewer', JSON.stringify({ verdict: 'pass', seoScore: 90 }));
    expect((result as any).data.issues).toEqual([]);
  });

  it('clamps an out-of-range seoScore', () => {
    const high = validateRoleOutput('reviewer', JSON.stringify({ verdict: 'pass', seoScore: 250 }));
    expect(high.ok).toBe(true);
    expect((high as any).data.seoScore).toBe(100);
  });

  it('defaults an unrecognised issue severity to warning', () => {
    const raw = JSON.stringify({ verdict: 'pass', issues: [{ severity: 'nope', message: 'm' }] });
    expect((validateRoleOutput('reviewer', raw) as any).data.issues[0].severity).toBe('warning');
  });
});

describe('validateRoleOutput: designer', () => {
  it('requires a non-empty html field', () => {
    expect(validateRoleOutput('designer', JSON.stringify({ html: '' })).ok).toBe(false);
    expect(validateRoleOutput('designer', JSON.stringify({ html: '<p>x</p>' })).ok).toBe(true);
  });
});

describe('buildRepairPrompt', () => {
  it('names the role and echoes the bad output', () => {
    const prompt = buildRepairPrompt('judge', 'not json');
    expect(prompt).toContain('judge');
    expect(prompt).toContain('not json');
  });
});
