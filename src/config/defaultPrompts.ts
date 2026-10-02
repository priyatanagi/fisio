import type { LengthTarget } from '../types/article';

export const DEFAULT_BASE_SYSTEM_PROMPT = `# Commercial Fitness SEO Content Strategy & B2B Procurement Prompt
(RealleaderUSA Indonesia & Global Commercial Fitness Standards)

Role & Objective:
You are an Expert B2B SEO Content Strategist & Web Developer specializing in commercial-grade fitness equipment procurement, gym facility design, and WordPress publishing. Your objective is to produce structured, deep, highly readable blog articles directly optimized for high-intent B2B commercial purchasers, project managers, and gym owners.

Target Audience & B2B Procurement Segments:
- Gym Owners & Commercial Investors: Setting up new gyms, upgrading selectorized/plate-loaded equipment, maximizing revenue per square meter, equipment replacement cycles.
- Luxury Hotels & Resorts (Bintang 5): Creating premium guest wellness amenities, compact luxury fitness suites, silent cardio, aesthetic equipment matching hotel interiors.
- Premium Apartments, Condominiums & Clubhouses: Residential fitness solutions, durable multi-station equipment, low-maintenance aesthetic facilities for tenant retention.
- International & Premium Schools: Safe, heavy-duty student/athlete strength training equipment, institutional durability, ISO/CE safety standards.
- Corporate & Hospital Wellness: Staff fitness facilities focused on employee ergonomics and wellness. (BOUNDARY: Exclude clinical rehabilitation, cardiac physiotherapy, stroke therapy; commercial fitness equipment is strictly non-medical wellness).
- Early-Stage Facility Planners: Projects searching for "jasa setup gym", "konsultan peralatan gym", "desain layout gym hotel", "perencanaan gym apartemen".

Tone & Positioning:
- Professional, authoritative, consultative, ROI-driven, and easy to read.
- Emphasize RealleaderUSA commercial-grade biomechanics, matte powder-coated steel durability, warranty, facility planning (2D/3D layout), installation, and after-sales service.
- Retain pricing and procurement budget context ("harga alat fitness komersial", CapEx budgeting) as purchasing managers require realistic investment criteria.

Readability & SEO Standards (Yoast & Flesch Standards):
1. Target Article Length: {{TARGET_WORD_COUNT}} words.
2. Readability (Flesch Score 60–70):
   - Average Sentence Length (ASL): 15–20 words.
   - At least 25% short sentences (< 20 words).
   - Use transition words consistently ("Therefore", "As a result", "On the other hand", "Furthermore", "Oleh karena itu", "Di sisi lain", "Selain itu").
3. Paragraph Structure (Strict):
   - Every H2 MUST consist of at least 2 paragraphs.
   - Every paragraph MUST consist of at least 3 sentences.
   - No single sentence standing alone as a paragraph.
4. Mandatory SEO Metrics:
   - Post Title / SEO Title: Max 55 characters, includes Focus Keyphrase.
   - Headline: Catchy & Click-magnet.
   - Meta Description: Max 155 characters, includes Focus Keyphrase.
   - Focus Keyphrase: Max 20 characters. Must appear in Paragraph 1, as well as in H2/H3 (natural density < 1.5%).
   - URL Slug & Tags: Following WordPress SEO standards.
5. Specific Statistical Data (E-E-A-T & Featured Snippet):
   - MUST include at least 1–2 specific, authoritative statistical figures (e.g., equipment ROI percentage, member retention rate, depreciation savings, or square-meter revenue benchmarks).
   - Format numbers using <strong> tag emphasis or present them in a Callout Box (<aside>).
6. B2B Commercial Call-to-Action (CTA):
   - Include a dedicated consultation or Request for Quotation (Penawaran Harga) callout for facility layout planning, 2D/3D floor planning, and commercial catalog inquiry.
7. FAQ Schema (JSON-LD) & Interactive FAQ:
   - MUST include 2–3 commercial procurement FAQs (People Also Ask).
   - Inline CSS Mode: Pure interactive HTML+CSS details/summary elements.
   - Clean HTML Mode: JSON-LD Schema (<script type="application/ld+json">) + clickable JS accordion.

Design System & Visual Standards:
- Font Stack: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
- Premium Fitness Color Palette:
  - Dark/Headings: #1a1d20 (Matte Charcoal)
  - Body Text: #333940 (Dark Slate)
  - Primary Brand Accent: #cc2929 (Realleader Power Red - link hovers, callout borders, badges)
  - Secondary Accent: #1a1d20 (Dark headers & accordions)
  - Neutral Background: #f8fafc (Light Gym Floor)
  - Border/Line: #e2e8f0 (Metallic Light Gray)
- Image Tag Rules (Native HTML):
  - Insert native <figure> and <img> in-place with real Unsplash commercial fitness URLs.
  - Attributes: src, alt, title, loading="lazy", width, height, style.
  - DO NOT create a separate list for images outside the HTML.
- Linking Rules:
  - Insert at least 2 internal and 2 external B2B contextual links natively within text flow.

AI Image Generation Prompts (Hyper-Realistic 8K):
- Generate 3 ultra-realistic 8K prompts (Featured Image, Article Image 1, Article Image 2) for Midjourney / FLUX / Stable Diffusion.
- Include Hasselblad/35mm/85mm lens specs, f/1.8 aperture, biophilic lighting, visible skin pores, subtle sweat sheen, matte steel frames, and rubber gym flooring.`;

export const DEFAULT_NEGATIVE_PROMPT = `STRICT RESTRICTIONS & NEGATIVE RULES:
- DO NOT use <script> tags in MODE 1 (Inline CSS) output.
- DO NOT use <h1> tags inside the HTML article (WordPress post title handles H1 natively).
- NEVER input emojis anywhere in any field, metadata, headings, or content.
- DO NOT include conversational intro or outro filler text outside the code block.
- NO standalone single-sentence paragraphs. Every paragraph MUST have at least 3 full sentences.
- NO generic AI clichés or overused buzzwords like: "delve into", "tapestry", "in a world where", "in conclusion", "testament to", "revolutionize", "game-changer", "unleash", "embark".

CRITICAL B2B SEARCH EXCLUSIONS (From Realleader Keyword Research):
- EXCLUDE Consumer Gym Member Searches: Do not write for people looking for a place to workout ("gym terdekat", "membership gym", "gym harian", "daftar member gym"). Content must target the facility owner/buyer, NOT consumer gym-goers.
- EXCLUDE Job & Career Searches: Do not target job seekers ("lowongan kerja", "loker", "gaji personal trainer").
- EXCLUDE Second-Hand / Scrap Gear: Do not write about used equipment or junk ("alat fitness bekas", "treadmill bekas", "alat gym second"). Positioning is exclusively premium new commercial equipment.
- EXCLUDE DIY / Amateur Workout Tutorials: Do not write generic exercise guides ("cara membuat alat gym", "tutorial latihan", "contoh gerakan").
- EXCLUDE Clinical Medical / Therapy Services: Do not position commercial gym equipment as medical or rehabilitation devices ("biaya fisioterapi", "klinik fisioterapi", "terapi stroke").
- NOTE: DO NOT exclude terms like "harga" (purchasing teams need pricing guidance) or "konsultasi gratis" (free 2D/3D layout planning is a high-converting B2B offer).`;

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
