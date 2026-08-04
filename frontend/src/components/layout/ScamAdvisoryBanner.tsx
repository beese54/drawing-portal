import { useUiStore } from '../../store/uiStore';

/**
 * Whole-of-government anti-scam advisory.
 *
 * Standard practice across .gov.sg services; the copy below is reproduced
 * verbatim from the live advisory on pub.gov.sg, read 2026-08-04. No DSS or IM8
 * control mandates it — it is voluntary good practice that supports the same
 * goal as TL-1/TL-3 (helping users recognise an authentic government service and
 * reducing fraud and phishing exposure). Nothing in the compliance documents
 * claims credit for it as a control.
 *
 * Placement is load-bearing: this renders AFTER <Masthead /> in AppLayout.
 * DSS TL-3 is Profile Level 0 (cardinal, no deviation route) and requires the
 * Official Government Banner to be the topmost component of the page. Moving
 * this above the masthead would break a cardinal control in order to add a
 * voluntary one.
 *
 * Built natively rather than by installing @govtechsg/sgds, matching Masthead's
 * reasoning — this project carries no CSS framework or design-system dependency,
 * and the advisory is not an SGDS component in any case.
 *
 * Three deliberate departures from PUB's own markup:
 *
 *  1. role="region" with a label, NOT PUB's role="alert". role="alert" is an
 *     assertive live region; on content that is present at page load it
 *     interrupts a screen reader to announce something that has not changed.
 *     A labelled region lets the user reach it on their own terms.
 *  2. https:// on the ScamShield link, where pub.gov.sg still uses http://.
 *  3. The link carries "opens in a new tab" in its accessible name, matching the
 *     idiom already established for the PUB logo in AppLayout.
 *
 * Colours are taken from the PUB advisory and contrast-checked against the
 * #f8f3d6 background: #344054 is 9.36:1, #2e2f33 is 11.96:1 and #1a3a5c is
 * 10.41:1 — all well clear of the 4.5:1 minimum (WP-13). Meaning is never
 * carried by colour alone (WP-11): the warning glyph is decorative and the text
 * stands on its own.
 *
 * Dismissal is persisted via uiStore. The app shell is a fixed 100vh with page
 * scrolling disabled, so this row is taken from the drawing canvas rather than
 * adding scroll — returning users get that height back.
 */

const ADVISORY_BG = '#f8f3d6';
const HEADLINE = '#344054';
const BODY = '#2e2f33';
const LINK = '#1a3a5c';

export function ScamAdvisoryBanner() {
  const dismissed = useUiStore((s) => s.scamAdvisoryDismissed);
  const dismiss = useUiStore((s) => s.dismissScamAdvisory);

  if (dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Scam advisory"
      style={{
        background: ADVISORY_BG,
        color: BODY,
        fontSize: '0.875rem',
        lineHeight: 1.45,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.5rem 1.25rem',
      }}
    >
      <span aria-hidden="true" style={{ color: HEADLINE, flexShrink: 0, lineHeight: 1.45 }}>
        &#9888;
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: HEADLINE, fontWeight: 700 }}>
          Government officials will NEVER ask you to transfer money or disclose bank
          log-in details over a phone call.
        </p>
        <p style={{ fontSize: '0.8125rem' }}>
          Call the 24/7 ScamShield Helpline at 1799 if you are unsure if something is a
          scam. For more information, visit{' '}
          <a
            href="https://www.scamshield.gov.sg"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="ScamShield, www.scamshield.gov.sg — opens in a new tab"
            style={{ color: LINK }}
          >
            www.scamshield.gov.sg
          </a>
          .
        </p>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss scam advisory"
        style={{
          background: 'none',
          border: 'none',
          color: HEADLINE,
          font: 'inherit',
          fontSize: '1rem',
          lineHeight: 1,
          cursor: 'pointer',
          flexShrink: 0,
          // 24x24 minimum pointer target (WO-18); the glyph alone is smaller.
          minWidth: '1.5rem',
          minHeight: '1.5rem',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        &#215;
      </button>
    </div>
  );
}
