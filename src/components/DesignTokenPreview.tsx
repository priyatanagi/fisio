import React from 'react';
import type { DesignRules } from '../types/profile';
import { previewStyles } from '../config/designTokens';

interface DesignTokenPreviewProps {
  rules: DesignRules;
}

/**
 * Renders the tokens on real article elements rather than swatches.
 *
 * A colour strip cannot show whether a heading font actually reads well or
 * whether a table is legible; showing the actual elements does. The same
 * `previewStyles` map feeds this and the CSS the Designer is instructed to emit,
 * so what is previewed here is what the article should come out as.
 */
export const DesignTokenPreview: React.FC<DesignTokenPreviewProps> = ({ rules }) => {
  const s = previewStyles(rules);

  return (
    <div
      style={s.page}
      className="rounded-xl border border-zinc-800 overflow-hidden"
    >
      <div className="px-5 py-4 space-y-4">
        <div>
          <h4 style={{ ...s.heading, marginBottom: '4px' }}>Commercial gym maintenance</h4>
          <p style={{ ...s.body, margin: 0, fontSize: '13px' }}>
            A practical guide for facility managers.
          </p>
        </div>

        <p style={{ ...s.body }}>
          Routine servicing keeps <a style={s.link} href="#preview">equipment warranty</a>{' '}
          coverage valid and prevents unplanned downtime across a facility.
        </p>

        <ul style={s.bullet}>
          <li style={{ marginBottom: '4px' }}>Inspect anchor bolts every month</li>
          <li style={{ marginBottom: '4px' }}>Lubricate cables quarterly</li>
          <li>Log serial numbers per asset</li>
        </ul>

        <ol style={s.number}>
          <li style={{ marginBottom: '4px' }}>Isolate the machine</li>
          <li style={{ marginBottom: '4px' }}>Replace worn components</li>
          <li>Return to service and record</li>
        </ol>

        <blockquote style={s.quote}>
          Downtime costs more than maintenance. Budget accordingly.
        </blockquote>

        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.head}>Interval</th>
              <th style={s.head}>Task</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={s.cell}>Monthly</td>
              <td style={s.cell}>Bolt torque check</td>
            </tr>
            <tr>
              <td style={s.cell}>Quarterly</td>
              <td style={s.cell}>Cable lubrication</td>
            </tr>
          </tbody>
        </table>

        <div style={s.faqItem}>
          <p style={s.faqQuestion}>How often should cables be replaced?</p>
          <p style={s.faqAnswer}>
            Inspect monthly and replace at the first sign of fraying.
          </p>
        </div>

        <p style={{ ...s.body, margin: 0 }}>
          Inline <code style={s.code}>serviceInterval</code> is logged per asset.
        </p>

        <a href="#preview" style={s.button}>
          Request a quotation
        </a>
      </div>

      <figure style={{ margin: 0 }}>
        <div
          style={{
            ...s.frame,
            height: '84px',
            background: 'linear-gradient(135deg, currentColor 0%, transparent 60%)',
            opacity: 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ ...s.caption, margin: 0 }}>Image frame</span>
        </div>
        <figcaption style={s.caption}>Caption sits beneath the frame.</figcaption>
      </figure>
    </div>
  );
};