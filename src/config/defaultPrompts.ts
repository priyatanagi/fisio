import type { LengthTarget } from '../types/article';

/**
 * Length presets, keyword segments and topic suggestions.
 *
 * This file used to also hold a `DEFAULT_BASE_SYSTEM_PROMPT` and a
 * `DEFAULT_NEGATIVE_PROMPT`. Neither reached a model: the prompts are assembled
 * per role in `src/server/agentPrompts.ts`, the writing and SEO numbers live in
 * `src/config/universalRules.ts`, the search exclusions in
 * `LEGACY_EXCLUSIONS` plus the profile, and the typography and palette in the
 * design tokens. They are not coming back here.
 */

export const LANGUAGE_OPTIONS: { id: 'en' | 'id' | 'es' | 'de' | 'fr'; label: string; flag: string }[] = [
  { id: 'en', label: 'English (US)', flag: 'EN' },
  { id: 'id', label: 'Bahasa Indonesia', flag: 'ID' },
  { id: 'es', label: 'Español', flag: 'ES' },
  { id: 'de', label: 'Deutsch', flag: 'DE' },
  { id: 'fr', label: 'Français', flag: 'FR' },
];

export const LENGTH_PRESETS = [
  { id: 'short', label: 'Compact', words: 600, range: '500 – 750 words', desc: 'Fast, high-impact overview' },
  { id: 'standard', label: 'Standard SEO', words: 950, range: '700 – 1,200 words', desc: 'Recommended Yoast & Flesch standard' },
  { id: 'long', label: 'Deep Authority', words: 1500, range: '1,200 – 1,800 words', desc: 'Exhaustive pillar guide for high competition' },
  { id: 'custom', label: 'Custom', words: 1000, range: 'Customizable', desc: 'Set your precise target length' },
] as const;

/**
 * Resolves the pipeline's target word count for a selected length preset.
 * Fixed presets drive the count directly; 'custom' keeps whatever the slider holds.
 */
export function targetWordsForLengthTarget(
  lengthTarget: LengthTarget,
  currentTargetWords: number
): number {
  if (lengthTarget === 'custom') return currentTargetWords;
  return LENGTH_PRESETS.find((p) => p.id === lengthTarget)?.words ?? currentTargetWords;
}

export interface KeywordSegment {
  id: string;
  name: string;
  description: string;
  keywords: { title: string; category: string; targetLang: 'id' | 'en' }[];
}

export const RESEARCH_KEYWORD_SEGMENTS: KeywordSegment[] = [
  {
    id: 'supplier_paket',
    name: '1. Supplier & Paket Gym',
    description: 'Menjangkau pemilik usaha gym baru dan investor pengadaan paket komersial',
    keywords: [
      { title: 'Supplier Alat Fitness Komersial & Paket Gym', category: 'Supplier & Paket', targetLang: 'id' },
      { title: 'Paket Alat Fitness untuk Usaha Gym Komersial', category: 'Supplier & Paket', targetLang: 'id' },
      { title: 'Commercial Gym Equipment Supplier Indonesia', category: 'Supplier & Paket', targetLang: 'en' },
      { title: 'Distributor Alat Fitness Premium & Harga Komersial', category: 'Supplier & Paket', targetLang: 'id' },
      { title: 'Commercial Gym Equipment Package ROI Analysis', category: 'Supplier & Paket', targetLang: 'en' },
    ],
  },
  {
    id: 'hotel_apartemen',
    name: '2. Hotel, Apartemen & Resort',
    description: 'Solusi fasilitas kebugaran hotel bintang 5, resort mewah, dan apartemen residensial',
    keywords: [
      { title: 'Pengadaan Alat Fitness Hotel Bintang 5 & Resort', category: 'Hotel & Resort', targetLang: 'id' },
      { title: 'Luxury Hotel Gym Equipment Setup & Guest Retention', category: 'Hotel & Resort', targetLang: 'en' },
      { title: 'Paket Alat Gym Apartemen & Residential Clubhouse', category: 'Apartemen & Hunian', targetLang: 'id' },
      { title: 'Apartment Gym Equipment Supplier Indonesia', category: 'Apartemen & Hunian', targetLang: 'en' },
      { title: 'Supplier Alat Gym Bali untuk Villa & Luxury Hotel', category: 'Hotel & Resort', targetLang: 'id' },
    ],
  },
  {
    id: 'produk_spesifik',
    name: '3. Produk Spesifik (Treadmill, Strength, Cardio)',
    description: 'Kebutuhan pengadaan alat spesifik komersial-grade',
    keywords: [
      { title: 'Treadmill Komersial vs Residential: Standar Ketahanan Motor AC', category: 'Produk Spesifik', targetLang: 'id' },
      { title: 'Commercial Selectorized Strength Equipment Guide', category: 'Produk Spesifik', targetLang: 'en' },
      { title: 'Alat Strength Komersial: Pin-Loaded vs Plate-Loaded', category: 'Produk Spesifik', targetLang: 'id' },
      { title: 'Multi Station Gym Komersial untuk Ruang Terbatas', category: 'Produk Spesifik', targetLang: 'id' },
      { title: 'Commercial Functional Trainer & Cable Cross Setup', category: 'Produk Spesifik', targetLang: 'en' },
    ],
  },
  {
    id: 'sekolah_corporate',
    name: '4. Sekolah & Corporate Wellness',
    description: 'Fasilitas kebugaran sekolah internasional, universitas, dan gym karyawan rumah sakit',
    keywords: [
      { title: 'Pengadaan Alat Gym Sekolah Internasional & Atlet Pelajar', category: 'Institusi Pendidikan', targetLang: 'id' },
      { title: 'International School Gym Equipment & Safety Standards', category: 'Institusi Pendidikan', targetLang: 'en' },
      { title: 'Pengadaan Alat Fitness Karyawan Rumah Sakit (Non-Medis)', category: 'Corporate Wellness', targetLang: 'id' },
      { title: 'Hospital Staff Gym Equipment for Healthcare Wellness', category: 'Corporate Wellness', targetLang: 'en' },
    ],
  },
  {
    id: 'perencanaan_layout',
    name: '5. Perencanaan & Layout 2D/3D',
    description: 'Pencarian tahap awal konsultasi tata letak, zonasi, dan efisiensi lantai',
    keywords: [
      { title: 'Jasa Setup Gym & Desain Layout Gym Komersial 2D/3D', category: 'Perencanaan & Layout', targetLang: 'id' },
      { title: 'Commercial Gym Planning & Equipment Layout Strategy', category: 'Perencanaan & Layout', targetLang: 'en' },
      { title: 'Konsultan Peralatan Gym: Menghitung Biaya Pengadaan & CapEx', category: 'Perencanaan & Layout', targetLang: 'id' },
      { title: 'Hotel Gym Design and Equipment Flow Planning', category: 'Perencanaan & Layout', targetLang: 'en' },
    ],
  },
];

export const POPULAR_FITNESS_TOPICS = [
  "Supplier Alat Fitness Komersial & Paket Gym Usaha",
  "Commercial Gym ROI: Selectorized vs Plate-Loaded Strength Equipment",
  "Pengadaan Alat Fitness Hotel Bintang 5 & Resort",
  "Jasa Setup Gym & Desain Layout 2D/3D Komersial",
  "Paket Alat Gym Apartemen & Residential Clubhouse",
];
