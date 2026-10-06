import React from 'react';
import { Image as ImageIcon, Sparkles } from 'lucide-react';
import type { DesignRules, UserProfile } from '../types/profile';
import { previewStyles, withTokenDefaults } from '../config/designTokens';

interface LiveTokenTestBannerProps {
  rules: DesignRules;
  profile: UserProfile;
}

export const LiveTokenTestBanner: React.FC<LiveTokenTestBannerProps> = ({ rules, profile }) => {
  const r = withTokenDefaults(rules);
  const s = previewStyles(r);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Live preview</h3>
          <p className="text-[11px] text-zinc-500">Updates as you change your design settings.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 px-2.5 py-1 text-[10px] text-zinc-400">
          <Sparkles className="h-3 w-3" /> Article sample
        </span>
      </div>

      <article style={s.page} className="w-full overflow-hidden rounded-xl border border-zinc-800">
        <div className="space-y-6 p-5 sm:p-8">
          <header>
            <p style={{ color: r.primaryColor, margin: '0 0 6px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {profile.niche || 'Your industry / niche'}
            </p>
            <h2 style={{ ...s.heading, fontSize: r.h1Size, margin: '0 0 8px' }}>
              {profile.businessName || 'Your brand'}: a practical guide
            </h2>
            <p style={{ ...s.body, margin: 0 }}>
              {profile.usp || 'Your brand introduction appears here, styled with your paragraph settings.'}
            </p>
          </header>

          <p style={{ ...s.body, margin: 0 }}>
            Clear, useful information helps readers understand their options. This paragraph shows your selected font, size, line height, alignment, and text color. Read more in this <a href="#preview-link" style={s.link}>related guide</a>, or review the <code style={s.code}>recommended next step</code>.
          </p>

          <ul
            style={{
              ...s.bullet,
              ...(r.bulletStyle === 'check' || r.bulletStyle === 'dash'
                ? { listStyleType: 'none', paddingLeft: 0 }
                : {}),
            }}
          >
            <li style={{ marginBottom: '5px' }}>
              {(r.bulletStyle === 'check' || r.bulletStyle === 'dash') && (
                <span style={{ color: r.primaryColor, marginRight: '8px' }}>
                  {r.bulletStyle === 'check' ? '✓' : '–'}
                </span>
              )}
              A sample bullet using your selected marker
            </li>
            <li>
              {(r.bulletStyle === 'check' || r.bulletStyle === 'dash') && (
                <span style={{ color: r.primaryColor, marginRight: '8px' }}>
                  {r.bulletStyle === 'check' ? '✓' : '–'}
                </span>
              )}
              Another item to show spacing and paragraph typography
            </li>
          </ul>

          <figure style={{ margin: 0 }}>
              <div
                role="img"
              aria-label="Placeholder for an article image"
              style={{
                ...s.frame,
                minHeight: '180px',
                background: `linear-gradient(135deg, ${r.primaryColor}18, ${r.accentColor}40)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <ImageIcon style={{ color: r.primaryColor, width: 24, height: 24 }} />
              <span style={s.caption}>Article image placeholder</span>
            </div>
            <figcaption style={s.caption}>Your image frame and caption style.</figcaption>
          </figure>

          <section>
            <h3 style={{ ...s.heading, fontSize: '17px' }}>A simple process to follow</h3>
            <ol style={s.number}>
              <li style={{ marginBottom: '5px' }}>Start with the reader’s main need</li>
              <li style={{ marginBottom: '5px' }}>Explain each step in plain language</li>
              <li>End with a clear next action</li>
            </ol>
          </section>

          <blockquote style={s.quote}>
            “Helpful advice gives people confidence to take the next step.”
          </blockquote>

          <div className="overflow-x-auto">
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.head}>Example</th>
                  <th style={s.head}>What to expect</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={s.cell}>First step</td>
                  <td style={s.cell}>A clear starting point</td>
                </tr>
                <tr>
                  <td style={{ ...s.cell, ...s.rowAlternate }}>Next step</td>
                  <td style={{ ...s.cell, ...s.rowAlternate }}>Practical guidance</td>
                </tr>
              </tbody>
            </table>
          </div>

          <section>
            <h3 style={{ ...s.heading, fontSize: '17px' }}>Frequently asked question</h3>
            <details style={s.faqItem} open={r.faqStyle !== 'accordion'}>
              <summary style={s.faqQuestion}>
                {r.faqStyle === 'numbered' ? '01. ' : ''}What should readers do next?
              </summary>
              <p style={s.faqAnswer}>Give them one clear action and explain what happens after they take it.</p>
            </details>
          </section>

          <a href="#profile-preview" style={s.button}>
            {profile.defaultCta || 'Your call to action'}
          </a>
        </div>
      </article>
    </div>
  );
};
