import { describe, it, expect } from 'vitest';
import { resolveTopicForRun, sharesSubject } from './topicFidelity';

describe('sharesSubject', () => {
  it('accepts a refinement that keeps the subject', () => {
    expect(sharesSubject('Treadmill buying', 'Choosing a commercial treadmill')).toBe(true);
    expect(sharesSubject('Treadmill buying guide', 'How to buy a treadmill')).toBe(true);
    expect(
      sharesSubject('Program Makan Bergizi Gratis', 'Panduan lengkap program makan bergizi gratis')
    ).toBe(true);
  });

  it('rejects a refinement that swaps the subject for the brand niche', () => {
    expect(
      sharesSubject(
        'Program Makan Bergizi Gratis',
        'Optimalisasi Infrastruktur Kebugaran untuk Fasilitas Berkinerja Tinggi'
      )
    ).toBe(false);
    expect(sharesSubject('Makan bergizi gratis di sekolah', 'Investment guide for gym owners')).toBe(
      false
    );
  });

  it('ignores case, punctuation, and filler words', () => {
    expect(sharesSubject('makan, bergizi! gratis?', 'Makan Bergizi untuk Anak')).toBe(true);
    expect(sharesSubject('the a of and', 'the a of and')).toBe(true);
  });

  it('does not treat very short shared tokens as evidence', () => {
    expect(sharesSubject('Tips SEO untuk gym', 'Gym equipment maintenance')).toBe(false);
  });

  it('treats an empty side as sharing the subject', () => {
    expect(sharesSubject('Program Makan Bergizi Gratis', '')).toBe(true);
  });
});

describe('resolveTopicForRun', () => {
  it('keeps a faithful judge refinement', () => {
    expect(resolveTopicForRun('Treadmill buying', 'Choosing a commercial treadmill')).toBe(
      'Choosing a commercial treadmill'
    );
  });

  it('falls back to the user topic when the judge drifted', () => {
    expect(
      resolveTopicForRun(
        'Program Makan Bergizi Gratis',
        'Optimalisasi Infrastruktur Kebugaran untuk Fasilitas Berkinerja Tinggi'
      )
    ).toBe('Program Makan Bergizi Gratis');
  });

  it('falls back to the user topic when the judge returned nothing', () => {
    expect(resolveTopicForRun('Program Makan Bergizi Gratis', '')).toBe(
      'Program Makan Bergizi Gratis'
    );
    expect(resolveTopicForRun('Program Makan Bergizi Gratis', undefined)).toBe(
      'Program Makan Bergizi Gratis'
    );
  });

  it('trims both sides', () => {
    expect(resolveTopicForRun('  Treadmill buying  ', '  Treadmill buying guide  ')).toBe(
      'Treadmill buying guide'
    );
  });
});