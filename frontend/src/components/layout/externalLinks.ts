/**
 * externalLinks.ts: every off-site link in the page chrome, in one place.
 *
 * The header's User Guide button (AppLayout.tsx) and the footer (Footer.tsx)
 * read from here, so when a destination changes, this is the only file to edit.
 *
 * PLACEHOLDERS (set 2026-11-04, to be replaced by the System Owner):
 *  - CONTACT_US: PUB's general Contact Us page.
 *  - FEEDBACK: PUB's Help & Feedback form, the one PUB's Contact Us page
 *    links to.
 *  - USER_GUIDE: the PUB homepage, until the how-to guide is published.
 * These links work, but they point at general PUB pages, not pages for
 * this portal. Search for "PLACEHOLDER" to find them.
 *
 * Suggestion for the final links: use go.gov.sg short links (for example
 * go.gov.sg/<portal>-guide). The guide can then move (to a SharePoint page, an
 * Isomer site or a video) without a new release of this portal. Claim the
 * short link before pointing this file at it: an unclaimed short link could
 * be taken by someone else.
 */

export const USER_GUIDE = {
  label: 'User Guide',
  href: 'https://www.pub.gov.sg', // PLACEHOLDER: the how-to guide site
};

export interface FooterLink {
  label: string;
  href: string;
}

/**
 * Footer links in the DSS TL-4 order:
 *   Contact Us · Feedback · FAQ (if any) · Sitemap (if any) ·
 *   Report Vulnerability · Privacy Statement · Terms of Use
 * The service has no FAQ or sitemap, which TL-4 allows, so neither is listed.
 * The User Guide is in the header only, so there is one place to look for it.
 */
export const FOOTER_LINKS: FooterLink[] = [
  { label: 'Contact Us', href: 'https://www.pub.gov.sg/contact-us' }, // PLACEHOLDER
  { label: 'Feedback', href: 'https://eservices.pub.gov.sg/helpandfeedback/report' }, // PLACEHOLDER
  { label: 'Report Vulnerability', href: 'https://go.gov.sg/report-vulnerability' },
  { label: 'Privacy Statement', href: 'https://www.pub.gov.sg/privacy-statement' },
  { label: 'Terms of Use', href: 'https://www.pub.gov.sg/termsofuse' },
];
