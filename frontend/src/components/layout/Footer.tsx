/**
 * Official Government Footer — DSS control TL-4 (Profile Level 1).
 *
 * TL-4 asks for these links, in this order, on every page:
 *   Contact / Contact Us · Feedback · FAQ (if any) · Sitemap (if any) ·
 *   Report Vulnerability · Privacy Statement · Terms of Use
 * followed by "© <current year>, Government of Singapore". PUB's own footer on
 * pub.gov.sg uses that same Government of Singapore wording.
 *
 * FOOTER_LINKS below is the one place to change. The order is the TL-4 order,
 * so keep it. A link whose href is null is not rendered: Contact Us and
 * Feedback are waiting on the System Owner's choice of destination, and a
 * link that goes nowhere is worse than no link. Setting the href makes it
 * appear in its place. This service has no FAQ or sitemap, which TL-4 allows,
 * so they are not listed at all.
 *
 * Destinations, checked 2026-10-27:
 *  - Report Vulnerability: go.gov.sg/report-vulnerability, the channel IM8 ST-3
 *    names. It redirects to GovTech's reporting page, which pub.gov.sg's own
 *    footer also links to.
 *  - Privacy Statement and Terms of Use: PUB's, the pages pub.gov.sg's footer
 *    links to.
 *
 * Every link opens in a new tab, for the reason given on the PUB logo in
 * AppLayout: a drawing lives only in browser memory, so leaving the page
 * would lose unsaved work.
 *
 * Built natively, not with @govtechsg/sgds, for the reason in Masthead.
 *
 * Colours match the application header: #ffffff on #1a3a5c is 11.6:1, well
 * clear of the 4.5:1 minimum (WP-13). Links are underlined, so they do not rely
 * on colour (WP-11), and each is at least 24px tall (WO-18).
 *
 * The app shell is a fixed 100vh with page scrolling disabled, so this row is
 * taken from the drawing canvas. It is kept to a single compact line on
 * desktop widths for that reason.
 */

const FOOTER_BG = '#1a3a5c';
const TEXT = '#ffffff';

interface FooterLink {
  label: string;
  href: string | null;
}

const FOOTER_LINKS: FooterLink[] = [
  { label: 'Contact Us', href: null },
  { label: 'Feedback', href: null },
  { label: 'Report Vulnerability', href: 'https://go.gov.sg/report-vulnerability' },
  { label: 'Privacy Statement', href: 'https://www.pub.gov.sg/privacy-statement' },
  { label: 'Terms of Use', href: 'https://www.pub.gov.sg/termsofuse' },
];

export function Footer() {
  const links = FOOTER_LINKS.filter(
    (link): link is FooterLink & { href: string } => link.href !== null,
  );

  return (
    <footer
      style={{
        background: FOOTER_BG,
        color: TEXT,
        fontSize: '0.8125rem',
        lineHeight: 1.5,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.25rem 1.5rem',
        padding: '0.25rem 1.25rem',
      }}
    >
      <nav aria-label="Footer">
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0 1.25rem',
          }}
        >
          {links.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.label} — opens in a new tab`}
                style={{
                  color: TEXT,
                  textDecoration: 'underline',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '1.5rem',
                }}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <p style={{ margin: 0 }}>
        &copy; {new Date().getFullYear()}, Government of Singapore
      </p>
    </footer>
  );
}
