/**
 * externalLinks.ts: every off-site link in the page chrome, in one place.
 *
 * The footer (Footer.tsx) reads from here, so when a destination changes,
 * this is the only file to edit. The User Guide is not a link: it is part of
 * the portal (components/guide/), opened from the header.
 *
 * PLACEHOLDERS (set 2026-11-04, to be replaced by the System Owner):
 *  - CONTACT_US: PUB's general Contact Us page.
 *  - FEEDBACK: PUB's Help & Feedback form, the one PUB's Contact Us page
 *    links to.
 *  - PILOT_SURVEY: null (survey prompt off) until the FormSG link is ready.
 * These links work, but they point at general PUB pages, not pages for
 * this portal. Search for "PLACEHOLDER" to find them.
 *
 * Suggestion for the final links: use go.gov.sg short links (for example
 * go.gov.sg/<portal>-feedback). The destination can then change without a
 * new release of this portal. Claim the short link before pointing this file
 * at it: an unclaimed short link could be taken by someone else.
 */

/**
 * The optional pilot survey offered when a user exports the JSON
 * (components/common/SurveyPrompt.tsx), and described in the User Guide.
 * null turns both off. Nothing from the drawing is added to this link: the
 * survey never receives the user's data.
 *
 * PLACEHOLDER: off until the pilot survey's FormSG link is ready. To turn it on:
 *   export const PILOT_SURVEY: { href: string } | null = { href: 'https://form.gov.sg/<form id>' };
 * Set it back to null when the pilot ends.
 */
export const PILOT_SURVEY: { href: string } | null = null;

export interface FooterLink {
  label: string;
  href: string;
}

/**
 * Footer links in the DSS TL-4 order:
 *   Contact Us · Feedback · FAQ (if any) · Sitemap (if any) ·
 *   Report Vulnerability · Privacy Statement · Terms of Use
 * The service has no FAQ or sitemap, which TL-4 allows, so neither is listed.
 * The User Guide is opened from the header, so there is one place to look for it.
 */
export const FOOTER_LINKS: FooterLink[] = [
  { label: 'Contact Us', href: 'https://www.pub.gov.sg/contact-us' }, // PLACEHOLDER
  { label: 'Feedback', href: 'https://eservices.pub.gov.sg/helpandfeedback/report' }, // PLACEHOLDER
  { label: 'Report Vulnerability', href: 'https://go.gov.sg/report-vulnerability' },
  { label: 'Privacy Statement', href: 'https://www.pub.gov.sg/privacy-statement' },
  { label: 'Terms of Use', href: 'https://www.pub.gov.sg/termsofuse' },
];
