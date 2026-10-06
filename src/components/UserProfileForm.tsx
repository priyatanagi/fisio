import React, { useEffect, useState } from 'react';
import { Building2, Check, Palette, Plus, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import type { UserProfile } from '../types/profile';
import { DEFAULT_USER_PROFILE, FALLBACK_BRAND, isProfileConfigured } from '../types/profile';
import { TOKEN_GROUPS, readToken, withTokenDefaults, type Token } from '../config/designTokens';
import { applyPreset, importPreset, BRAND_PRESETS, type FormatOverrides } from '../config/brandPresets';
import { LiveTokenTestBanner } from './LiveTokenTestBanner';
import { BrandKitPanel } from './BrandKitPanel';
import { RuleDiffPanel } from './RuleDiffPanel';

interface UserProfileFormProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
}

const SAMPLE_PROFILE: UserProfile = {
  businessName: 'Klinik Sehat Sentosa',
  niche: 'Klinik fisioterapi dan rehabilitas',
  location: 'Jakarta Selatan, Indonesia',
  targetMarket: 'Karyawan kantoran usia 25-45 tahun dengan keluhan nyeri punggung',
  usp: 'Terapi manualcombine dengan latihan rehabilitasi berbasis bukti, Curves of research',
  toneOfVoice: 'Profesional, hangat, dan mudah dipahami',
  defaultCta: 'Jadwalkan konsultasi fisioterapi pertama Anda hari ini.',
  designRules: {
    primaryColor: '#0d9488',
    secondaryColor: '#134e4a',
    accentColor: '#f59e0b',
    backgroundColor: '#f8fafc',
    textColor: '#1f2937',
    headingFont: '"Plus Jakarta Sans", system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    textAlignment: 'left',
    buttonStyle: 'rounded',
    blockquoteStyle: 'accent-bar',
    bodyStyle: 'readable',
    headingStyle: 'strong',
    hyperlinkStyle: 'underline',
    bulletStyle: 'disc',
    numberingStyle: 'decimal',
    imageStyle: 'rounded',
    codeStyle: 'subtle',
    tableStyle: 'header-fill',
    faqStyle: 'divided',
  },
  exclusions: [
    'EXCLUDE voucher and discount searches ("diskon fisioterapi", "promo gratis") — position on clinical outcomes, not price.',
    'EXCLUDE acute emergency searches ("fisioterapi积分 emergency 24 jam") — refer those cases to a hospital.',
  ],
};

/** Layout mirrors the reference: short fields pair up, long ones span both columns. */
const FIELD_LABELS: {
  key: keyof UserProfile;
  label: string;
  placeholder: string;
  full?: boolean;
}[] = [
  { key: 'businessName', label: 'Business / brand name', placeholder: 'Sehat Sentosa' },
  { key: 'niche', label: 'Industry / niche', placeholder: 'Klinik fisioterapi' },
  { key: 'location', label: 'Location', placeholder: 'Jakarta Selatan, Indonesia' },
  { key: 'defaultCta', label: 'Default call to action', placeholder: 'Book your first session today.' },
  { key: 'targetMarket', label: 'Target market', placeholder: 'Office workers aged 25-45 with back pain', full: true },
  { key: 'usp', label: 'Unique selling proposition', placeholder: 'What sets you apart?', full: true },
  { key: 'toneOfVoice', label: 'Tone of voice', placeholder: 'Professional, warm, easy to read', full: true },
];

interface TokenFieldProps {
  token: Token;
  value: string;
  onChange: (value: string) => void;
}

/** One token control. The control type follows the token so a colour never asks
 *  for a font stack and a choice never pretends to be free text. */
const TokenField: React.FC<TokenFieldProps> = ({ token, value, onChange }) => {
  const label = (
    <span className="text-[11px] text-zinc-300 font-medium" title={token.hint}>
      {token.label}
    </span>
  );

  if (token.kind === 'color') {
    return (
      <label className="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-300" title={token.hint}>{token.label}</span>
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${token.label} color picker`}
            className="h-7 w-8 shrink-0 cursor-pointer rounded border border-zinc-700 bg-transparent p-0.5"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${token.label} hex value`}
            className="w-[76px] min-w-0 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[10px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
          />
      </label>
    );
  }

  if (token.kind === 'choice') {
    const custom = value.startsWith('custom-css:');
    return (
      <label className="block space-y-1">
        {label}
        <select
          value={custom ? '__custom_css__' : value}
          onChange={(e) => onChange(e.target.value === '__custom_css__' ? 'custom-css:' : e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] text-zinc-200 outline-none focus:border-zinc-500"
        >
          {token.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value="__custom_css__">Custom CSS…</option>
        </select>
        {custom && (
          <textarea
            value={value.slice('custom-css:'.length)}
            onChange={(e) => onChange(`custom-css:${e.target.value}`)}
            placeholder="font-size: 1.1em; border-radius: 8px;"
            rows={2}
            aria-label={`${token.label} custom CSS declarations`}
            className="w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
          />
        )}
      </label>
    );
  }

  return (
    <label className="block space-y-1">
      {label}
      <input
        type="text"
        value={value}
        placeholder={token.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
      />
    </label>
  );
};

export const UserProfileForm: React.FC<UserProfileFormProps> = ({ profile, onSave }) => {
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [section, setSection] = useState<'business' | 'brand' | 'design' | 'rules'>('business');
  const [newExclusion, setNewExclusion] = useState('');
  const [overrides, setOverrides] = useState<FormatOverrides>(
    () => profile.formatOverrides ?? {}
  );

  const updateDraft: typeof setDraft = (next) => {
    setDraft(next);
    setHasChanges(true);
    setSaveStatus('saving');
  };

  const updateOverrides: typeof setOverrides = (next) => {
    setOverrides(next);
    setHasChanges(true);
    setSaveStatus('saving');
  };

  useEffect(() => {
    if (!hasChanges) return;
    const timeout = window.setTimeout(() => {
      onSave({ ...draft, formatOverrides: overrides });
      setHasChanges(false);
      setSaveStatus('saved');
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [draft, hasChanges, onSave, overrides]);

  const setField = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) =>
    updateDraft((prev) => ({ ...prev, [key]: value }));

  const setDesign = (key: string, value: string) =>
    updateDraft((prev) => ({
      ...prev,
      designRules: { ...prev.designRules, [key]: value } as typeof prev.designRules,
    }));

  const handleApplyPreset = (payload: string) => {
    // A new kit replaces the base tokens; per-format overrides would otherwise
    // keep overriding choices the user just replaced wholesale.
    updateOverrides({});
    updateDraft((prev) => {
      if (BRAND_PRESETS.some((p) => p.id === payload)) {
        return { ...prev, designRules: applyPreset(prev.designRules, payload) };
      }
      const result = importPreset(payload);
      return result.preset ? { ...prev, designRules: result.preset.rules } : prev;
    });
  };

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Your brand profile</h2>
          <p className="text-xs text-zinc-400">Keep the details your content needs in one place.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400" role="status" aria-live="polite">
          {saveStatus === 'saved' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />}
          {saveStatus === 'saved' ? 'All changes saved' : 'Saving changes…'}
        </span>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-100">{draft.businessName || 'Set up your brand'}</p>
            <p className="mt-0.5 text-xs text-zinc-400">{draft.niche || 'Add your industry to personalize generated content'}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${isProfileConfigured(draft) ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'}`}>
            {isProfileConfigured(draft) ? 'Profile ready' : 'Needs details'}
          </span>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-zinc-800" aria-label="Profile sections">
        {([
          ['business', 'Business', Building2],
          ['brand', 'Brand kit', Palette],
          ['design', 'Design & preview', SlidersHorizontal],
          ['rules', 'Content rules', ShieldCheck],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            aria-current={section === id ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-medium transition-colors ${section === id ? 'border-teal-400 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </nav>

      {section === 'business' && <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div>
          <h3 className="text-xs font-semibold text-zinc-200">Core brand fundamentals</h3>
          <p className="text-[11px] text-zinc-500">
            The essentials used to tailor your content and AI prompts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => updateDraft(SAMPLE_PROFILE)}
          className="px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />Load sample profile
        </button>

        {!isProfileConfigured(draft) && (
          <div className="p-3 bg-amber-950/40 border border-amber-900 rounded-lg text-[11px] text-amber-300">
            Profile is incomplete. Generated content will use fallback values:{' '}
            <span className="font-medium">{FALLBACK_BRAND.businessName}</span>,{' '}
            {FALLBACK_BRAND.niche}.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FIELD_LABELS.map((field) => (
            <label
              key={field.key}
              className={`block space-y-1 ${field.full ? 'sm:col-span-2' : ''}`}
            >
              <span className="text-xs text-zinc-300 font-medium">{field.label}</span>
              <textarea
                value={String(draft[field.key] ?? '')}
                onChange={(e) => setField(field.key, e.target.value as UserProfile[typeof field.key])}
                placeholder={field.placeholder}
                rows={field.key === 'targetMarket' || field.key === 'usp' ? 2 : 1}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 outline-none focus:border-zinc-500 resize-y"
              />
            </label>
          ))}
        </div>
      </section>}

      {section === 'brand' && <section className="space-y-5">
        <RuleDiffPanel saved={profile.designRules} draft={draft.designRules} />
        <BrandKitPanel
          rules={withTokenDefaults(draft.designRules)}
          onApplyPreset={handleApplyPreset}
          overrides={overrides}
          onOverrideChange={updateOverrides}
        />
      </section>}

      {section === 'design' && <section className="w-full space-y-5">
        <div className="w-full space-y-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div>
            <h3 className="text-xs font-semibold text-zinc-200">Design tokens</h3>
            <p className="text-[11px] text-zinc-500">
              Fine-tune the colors, typography, and content styles used in generated designs.
            </p>
          </div>
          <div className="space-y-5">
            {TOKEN_GROUPS.map((group) => (
              <section key={group.id} className="space-y-2">
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
                    {group.title}
                  </h4>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">{group.summary}</p>
                </div>
              <div className={group.id === 'color' ? 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
                  {group.tokens.map((token) => (
                    <TokenField
                      key={token.key}
                      token={token}
                      value={readToken(draft.designRules, token)}
                      onChange={(value) => setDesign(token.key, value)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
        <LiveTokenTestBanner rules={draft.designRules} profile={draft} />
      </section>}

      {section === 'rules' && <section className="space-y-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div>
          <h3 className="text-xs font-semibold text-zinc-200">Search exclusions</h3>
          <p className="text-[11px] text-zinc-500">
            Topics the article must avoid. Replace these to match your own market.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {draft.exclusions.map((rule, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300"
            >
              <span className="leading-relaxed">{rule}</span>
              <button
                onClick={() =>
                  updateDraft((prev) => ({
                    ...prev,
                    exclusions: prev.exclusions.filter((_, i) => i !== index),
                  }))
                }
                className="text-zinc-500 hover:text-rose-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={newExclusion}
            onChange={(e) => setNewExclusion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (!newExclusion.trim()) return;
              updateDraft((prev) => ({
                ...prev,
                exclusions: [...prev.exclusions, newExclusion.trim()],
              }));
              setNewExclusion('');
            }}
            placeholder="Add new phrase exclusion (press Enter)..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] text-zinc-100 outline-none focus:border-zinc-500"
          />
          <button
            onClick={() => {
              if (!newExclusion.trim()) return;
                updateDraft((prev) => ({
                ...prev,
                exclusions: [...prev.exclusions, newExclusion.trim()],
              }));
              setNewExclusion('');
            }}
            className="px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add Rule
          </button>
        </div>
      </section>}

      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            updateDraft(DEFAULT_USER_PROFILE);
            updateOverrides({});
          }}
          className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs"
        >
          Reset
        </button>
      </div>
    </div>
  );
};
