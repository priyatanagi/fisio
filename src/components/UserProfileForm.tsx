import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Check,
  Download,
  FileUp,
  Palette,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { UserProfile } from '../types/profile';
import { FALLBACK_BRAND, isProfileConfigured } from '../types/profile';
import type { UniversalRules } from '../config/universalRules';
import { TOKEN_GROUPS, readToken, withTokenDefaults, type Token } from '../config/designTokens';
import { applyPreset, importPreset, BRAND_PRESETS, type FormatOverrides } from '../config/brandPresets';
import { LiveTokenTestBanner } from './LiveTokenTestBanner';
import { BrandKitPanel } from './BrandKitPanel';
import { RuleDiffPanel } from './RuleDiffPanel';
import {
  parseProfileJson,
  profileToJson,
  resetProfileSection,
  PROFILE_SECTION_LABELS,
  SAMPLE_PROFILE,
  type ProfileSection,
} from '../utils/profileIO';

interface UserProfileFormProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  universalRules: UniversalRules;
  onSaveRules: (rules: UniversalRules) => void;
}

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

/** Tab names, kept separate from the longer "what this clears" labels. */
const SECTION_NAMES: Record<ProfileSection, string> = {
  business: 'Business',
  brand: 'Brand kit',
  design: 'Design & preview',
  rules: 'Content rules',
};

type NumericRuleKey =
  | 'targetFleschMin'
  | 'targetFleschMax'
  | 'maxSentenceWords'
  | 'minSentencesPerParagraph'
  | 'minParagraphsPerH2'
  | 'seoTitleMaxChars'
  | 'metaDescriptionMaxChars'
  | 'focusKeyphraseMaxChars';

type ToggleRuleKey = 'requireStats' | 'requireFaq' | 'allowH1InArticle' | 'allowInlineScripts';

const NUMERIC_RULE_FIELDS: { key: NumericRuleKey; label: string; hint: string }[] = [
  { key: 'targetFleschMin', label: 'Flesch min', hint: 'Lower bound of the readability target' },
  { key: 'targetFleschMax', label: 'Flesch max', hint: 'Upper bound of the readability target' },
  { key: 'maxSentenceWords', label: 'Max words / sentence', hint: '' },
  { key: 'minSentencesPerParagraph', label: 'Min sentences / paragraph', hint: 'No single-sentence paragraphs' },
  { key: 'minParagraphsPerH2', label: 'Min paragraphs / H2', hint: '' },
  { key: 'seoTitleMaxChars', label: 'SEO title max chars', hint: '' },
  { key: 'metaDescriptionMaxChars', label: 'Meta description max', hint: '' },
  { key: 'focusKeyphraseMaxChars', label: 'Keyphrase max chars', hint: '' },
];

const TOGGLE_RULE_FIELDS: { key: ToggleRuleKey; label: string }[] = [
  { key: 'requireStats', label: 'Require statistics' },
  { key: 'requireFaq', label: 'Require FAQ' },
  { key: 'allowH1InArticle', label: 'Allow <h1> in body' },
  { key: 'allowInlineScripts', label: 'Allow inline scripts' },
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

export const UserProfileForm: React.FC<UserProfileFormProps> = ({
  profile,
  onSave,
  universalRules,
  onSaveRules,
}) => {
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [rules, setRules] = useState<UniversalRules>(universalRules);
  const [hasChanges, setHasChanges] = useState(false);
  const [rulesDirty, setRulesDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [section, setSection] = useState<ProfileSection>('business');
  const [previewWidth, setPreviewWidth] = useState(50);
  const designLayoutRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const [pendingReset, setPendingReset] = useState<string | null>(null);
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

  const updateRules = (next: UniversalRules) => {
    setRules(next);
    setRulesDirty(true);
    setSaveStatus('saving');
  };

  // One debounce for both documents: the profile and the writing rules are
  // separate app states, so each is handed to its own save handler.
  useEffect(() => {
    if (!hasChanges && !rulesDirty) return;
    const timeout = window.setTimeout(() => {
      if (hasChanges) onSave({ ...draft, formatOverrides: overrides });
      if (rulesDirty) onSaveRules(rules);
      setHasChanges(false);
      setRulesDirty(false);
      setSaveStatus('saved');
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [draft, overrides, rules, hasChanges, rulesDirty, onSave, onSaveRules]);

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

  const downloadJson = (filename: string, payload: string) => {
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFromFile = async (file: File) => {
    const result = parseProfileJson(await file.text());
    if (!result.ok) {
      setFileMessage(`${file.name}: ${result.error}`);
      return;
    }
    updateDraft(result.profile);
    updateOverrides(result.profile.formatOverrides ?? {});
    const slug = result.profile.businessName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'profile';
    setFileMessage(`Loaded ${slug} — ${result.profile.exclusions.length} exclusion rule(s).`);
  };

  // A reset only ever clears the section on screen, and it is confirmed first:
  // one stray click used to wipe the whole brand kit with no way back.
  const applyReset = () => {
    if (!section) return;
    const next = resetProfileSection(section, { profile: draft, overrides, rules });
    setDraft(next.profile);
    setOverrides(next.overrides);
    setRules(next.rules);
    setHasChanges(true);
    setRulesDirty(true);
    setSaveStatus('saving');
    setPendingReset(null);
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

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs inline-flex items-center gap-1.5"
          >
            <FileUp className="w-3.5 h-3.5" />Import profile from file
          </button>
          <button
            type="button"
            onClick={() =>
              downloadJson(
                `sample-profile-${SAMPLE_PROFILE.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`,
                profileToJson(SAMPLE_PROFILE)
              )
            }
            className="px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />Download sample profile
          </button>
          <button
            type="button"
            onClick={() =>
              downloadJson(
                `${(draft.businessName.trim() || 'profile').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`,
                profileToJson({ ...draft, formatOverrides: overrides })
              )
            }
            className="px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />Download my profile
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Choose a profile JSON file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importFromFile(file);
            }}
          />
        </div>

        {fileMessage && (
          <p className="text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
            {fileMessage}
          </p>
        )}

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
          onRulesChange={(next) => updateDraft((prev) => ({ ...prev, designRules: next }))}
          overrides={overrides}
          onOverrideChange={updateOverrides}
        />
      </section>}

      {section === 'design' && <section className="w-full">
        <div
          ref={designLayoutRef}
          className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,var(--controls-width))_12px_minmax(0,var(--preview-width))]"
          style={{ '--controls-width': `${100 - previewWidth}fr`, '--preview-width': `${previewWidth}fr` } as React.CSSProperties}
        >
        <div className="min-w-0 space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
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
              <div className={group.id === 'color' ? 'grid grid-cols-2 sm:grid-cols-3 gap-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
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
        <div
          role="separator"
          aria-label="Resize design controls and live preview"
          aria-orientation="vertical"
          aria-valuemin={30}
          aria-valuemax={70}
          aria-valuenow={previewWidth}
          tabIndex={0}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const bounds = designLayoutRef.current?.getBoundingClientRect();
            if (!bounds) return;
            const ratio = (event.clientX - bounds.left) / bounds.width;
            setPreviewWidth(Math.min(70, Math.max(30, (1 - ratio) * 100)));
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            setPreviewWidth((width) => Math.min(70, Math.max(30, width + (event.key === 'ArrowLeft' ? -2 : 2))));
          }}
          className="hidden cursor-col-resize touch-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-teal-400 xl:flex"
        >
          <span className="h-12 w-1 rounded-full bg-zinc-700" />
        </div>
        <div className="min-w-0 xl:sticky xl:top-4">
          <LiveTokenTestBanner rules={draft.designRules} profile={draft} />
        </div>
        </div>
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

        <div className="pt-3 border-t border-zinc-800 space-y-3">
          <div>
            <h3 className="text-xs font-semibold text-zinc-200">Writing & SEO rules</h3>
            <p className="text-[11px] text-zinc-500">
              The numbers every generation is measured against. They travel with your profile, so a
              second device reads the same limits.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {NUMERIC_RULE_FIELDS.map((field) => (
              <label key={field.key} className="block space-y-1">
                <span className="text-[10px] text-zinc-400" title={field.hint}>
                  {field.label}
                </span>
                <input
                  type="number"
                  min={1}
                  value={rules[field.key]}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    if (!Number.isFinite(value) || value < 1) return;
                    updateRules({ ...rules, [field.key]: value });
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
                />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {TOGGLE_RULE_FIELDS.map((field) => (
              <label
                key={field.key}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] cursor-pointer transition-colors ${
                  rules[field.key]
                    ? 'border-teal-800 bg-teal-950/40 text-teal-200'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={rules[field.key]}
                  onChange={(event) => updateRules({ ...rules, [field.key]: event.target.checked })}
                  className="accent-teal-500"
                />
                {field.label}
              </label>
            ))}
          </div>
        </div>
      </section>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setPendingReset(PROFILE_SECTION_LABELS[section])}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset this section
        </button>
        <span className="text-[11px] text-zinc-600">
          Clears only <span className="text-zinc-400">{SECTION_NAMES[section]}</span> — the other
          tabs keep their values.
        </span>
      </div>

      {pendingReset && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm reset"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4 shadow-2xl">
            <div>
              <h4 className="text-sm font-semibold text-zinc-100">Reset {pendingReset}?</h4>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Everything in this section goes back to its default values. This cannot be undone —
                other sections and your saved articles are not touched.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingReset(null)}
                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs"
              >
                Keep them
              </button>
              <button
                onClick={applyReset}
                className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium"
              >
                Reset section
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
