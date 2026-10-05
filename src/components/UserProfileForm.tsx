import React, { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { UserProfile } from '../types/profile';
import { DEFAULT_USER_PROFILE, FALLBACK_BRAND, isProfileConfigured } from '../types/profile';
import { TOKEN_GROUPS, readToken, withTokenDefaults, type Token } from '../config/designTokens';
import { applyPreset, importPreset, BRAND_PRESETS, type FormatOverrides } from '../config/brandPresets';
import { DesignTokenPreview } from './DesignTokenPreview';
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

const FIELD_LABELS: { key: keyof UserProfile; label: string; placeholder: string }[] = [
  { key: 'businessName', label: 'Business / brand name', placeholder: 'Sehat Sentosa' },
  { key: 'niche', label: 'Industry / niche', placeholder: 'Klinik fisioterapi' },
  { key: 'location', label: 'Location', placeholder: 'Jakarta Selatan, Indonesia' },
  { key: 'targetMarket', label: 'Target market', placeholder: 'Office workers aged 25-45 with back pain' },
  { key: 'usp', label: 'Unique selling proposition', placeholder: 'What sets you apart?' },
  { key: 'toneOfVoice', label: 'Tone of voice', placeholder: 'Professional, warm, easy to read' },
  { key: 'defaultCta', label: 'Default call to action', placeholder: 'Book your first session today.' },
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
      <label className="block space-y-1">
        {label}
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="w-8 h-8 rounded border border-zinc-700 bg-transparent cursor-pointer shrink-0"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
          />
        </div>
      </label>
    );
  }

  if (token.kind === 'choice') {
    return (
      <label className="block space-y-1">
        {label}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] text-zinc-200 outline-none focus:border-zinc-500"
        >
          {token.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
  const [saved, setSaved] = useState(false);
  const [newExclusion, setNewExclusion] = useState('');
  const [overrides, setOverrides] = useState<FormatOverrides>(
    () => profile.formatOverrides ?? {}
  );

  const setField = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const setDesign = (key: string, value: string) =>
    setDraft((prev) => ({
      ...prev,
      designRules: { ...prev.designRules, [key]: value } as typeof prev.designRules,
    }));

  const handleSave = () => {
    // Overrides are saved with the profile; leaving them in local state would
    // silently drop them on reload and on any per-format styling.
    onSave({ ...draft, formatOverrides: overrides });
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  const handleApplyPreset = (payload: string) => {
    // A new kit replaces the base tokens; per-format overrides would otherwise
    // keep overriding choices the user just replaced wholesale.
    setOverrides({});
    setDraft((prev) => {
      if (BRAND_PRESETS.some((p) => p.id === payload)) {
        return { ...prev, designRules: applyPreset(prev.designRules, payload) };
      }
      const result = importPreset(payload);
      return result.preset ? { ...prev, designRules: result.preset.rules } : prev;
    });
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Brand profile</h2>
          <p className="text-[11px] text-zinc-400">
            Every prompt is built from this. Empty fields fall back to the legacy defaults.
          </p>
        </div>
        <button
          onClick={() => setDraft(SAMPLE_PROFILE)}
          className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Load sample profile
        </button>
      </div>

      <RuleDiffPanel saved={profile.designRules} draft={draft.designRules} />

      <BrandKitPanel
        rules={withTokenDefaults(draft.designRules)}
        onApplyPreset={handleApplyPreset}
        overrides={overrides}
        onOverrideChange={setOverrides}
      />

      {!isProfileConfigured(draft) && (
        <div className="p-3 bg-amber-950/40 border border-amber-900 rounded-lg text-[11px] text-amber-300">
          Profile is incomplete. Generated content will use fallback values:{' '}
          <span className="font-medium">{FALLBACK_BRAND.businessName}</span>,{' '}
          {FALLBACK_BRAND.niche}.
        </div>
      )}

      <div className="space-y-3">
        {FIELD_LABELS.map((field) => (
          <label key={field.key} className="block space-y-1">
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

      <div className="space-y-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div>
          <h3 className="text-xs font-semibold text-zinc-200">Design tokens</h3>
          <p className="text-[11px] text-zinc-500">
            Grouped by what they affect. Every value below is passed to the Designer prompt and
            applied as inline CSS, so these choices are instructions, not decoration.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-5">
            {TOKEN_GROUPS.map((group) => (
              <section key={group.id} className="space-y-2">
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
                    {group.title}
                  </h4>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">{group.summary}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {group.tokens.map((token) => (
                    <TokenField
                      key={token.key}
                      token={token}
                      value={readToken(draft.designRules, token)}
                      onChange={(v) => setDesign(token.key, v)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="lg:sticky lg:top-4 self-start space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
                Live preview
              </h4>
              <span className="text-[10px] text-zinc-500">updates as you type</span>
            </div>
            <DesignTokenPreview rules={withTokenDefaults(draft.designRules)} />
          </div>
        </div>
      </div>

      <div className="space-y-2 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-zinc-200">Search exclusions</h3>
        <p className="text-[11px] text-zinc-500">
          Topics the article must avoid. Replace these to match your own market.
        </p>
        <ul className="space-y-1.5">
          {draft.exclusions.map((rule, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="flex-1 text-[11px] text-zinc-400 leading-relaxed">{rule}</span>
              <button
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    exclusions: prev.exclusions.filter((_, i) => i !== index),
                  }))
                }
                className="text-zinc-500 hover:text-rose-400 p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            type="text"
            value={newExclusion}
            onChange={(e) => setNewExclusion(e.target.value)}
            placeholder="EXCLUDE ..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] text-zinc-100 outline-none focus:border-zinc-500"
          />
          <button
            onClick={() => {
              if (!newExclusion.trim()) return;
              setDraft((prev) => ({
                ...prev,
                exclusions: [...prev.exclusions, newExclusion.trim()],
              }));
              setNewExclusion('');
            }}
            className="px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px]"
          >
            Add
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold flex items-center gap-1.5"
        >
          {saved ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              Saved
            </>
          ) : (
            'Save profile'
          )}
        </button>
        <button
          onClick={() => setDraft(DEFAULT_USER_PROFILE)}
          className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs"
        >
          Reset
        </button>
      </div>
    </div>
  );
};
