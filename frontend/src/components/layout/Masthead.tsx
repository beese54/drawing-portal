import { useState } from 'react';

/**
 * Official Government Banner (masthead).
 *
 * Required on every page of a .gov.sg digital service — DSS control TL-3
 * (Profile Level 0, cardinal). It must be the topmost component of the page,
 * so this renders before the application header in AppLayout.
 *
 * Copy is reproduced verbatim from the live banner on tech.gov.sg. Built
 * natively rather than by installing @govtechsg/sgds because this project
 * carries no CSS framework or design-system dependency today; swap this for
 * the real SGDS component when the wider SGDS adoption happens.
 *
 * The Singapore lion-head crest is NOT bundled — drop the official asset at
 * frontend/public/sg-crest.svg and it appears automatically. The banner is
 * fully readable and compliant on text alone until then; see
 * frontend/PUBLIC_ASSETS.md.
 *
 * Colours are contrast-checked: #333 on #f0f0f0 is 11.1:1 and #1a3a5c on
 * #f0f0f0 is 9.8:1, both well clear of the 4.5:1 minimum (WP-13).
 */

const BANNER_BG = '#f0f0f0';
const TEXT = '#333333';
const LINK = '#1a3a5c';

export function Masthead() {
  const [expanded, setExpanded] = useState(false);
  const [crestFailed, setCrestFailed] = useState(false);

  return (
    <div
      style={{
        background: BANNER_BG,
        color: TEXT,
        fontSize: '0.875rem',
        lineHeight: 1.5,
        flexShrink: 0,
      }}
    >
      <div style={{ padding: '0.25rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {!crestFailed && (
          <img
            src="/sg-crest.svg"
            alt=""
            aria-hidden="true"
            onError={() => setCrestFailed(true)}
            style={{ height: '1rem', width: 'auto', display: 'block' }}
          />
        )}
        <span>A Singapore Government Agency Website</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="masthead-identify"
          style={{
            background: 'none',
            border: 'none',
            padding: '0.25rem',
            color: LINK,
            font: 'inherit',
            textDecoration: 'underline',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          How to identify
          <span aria-hidden="true" style={{ fontSize: '0.625rem' }}>{expanded ? '▲' : '▼'}</span>
        </button>
      </div>

      {expanded && (
        <div
          id="masthead-identify"
          style={{
            padding: '0.75rem 1.25rem 1rem',
            display: 'flex',
            gap: '2rem',
            flexWrap: 'wrap',
            borderTop: `1px solid #c4c4c4`,
          }}
        >
          <div style={{ flex: '1 1 18rem', minWidth: 0 }}>
            <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
              Official website links end with .gov.sg
            </p>
            <p>
              Government agencies communicate via <strong>.gov.sg</strong> websites
              (e.g. go.gov.sg/open).{' '}
              <a
                href="https://go.gov.sg/trusted-sites"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: LINK }}
              >
                Trusted websites
              </a>
            </p>
          </div>
          <div style={{ flex: '1 1 18rem', minWidth: 0 }}>
            <p style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
              Secure websites use HTTPS
            </p>
            <p>
              Look for a <strong>lock</strong> (<span aria-label="lock icon" role="img">🔒</span>) or
              https:// as an added precaution. Share sensitive information only on
              official, secure websites.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
