# Static assets (frontend/public/)

Files here are copied to the site root by Vite at build time and are served
as `/<filename>`.

## `sg-crest.svg` — required, not bundled

The Official Government Banner (`src/components/layout/Masthead.tsx`, DSS
control TL-3) renders the Singapore lion-head crest from `/sg-crest.svg`.

**That file is deliberately not committed here.** The lion head is a
protected national symbol under the Singapore Arms and Flag and National
Anthem Act — it must be the official artwork, not a redrawn approximation.

To add it, obtain the official artwork and save it as
`frontend/public/sg-crest.svg`.

The asset ships inside GovTech's own design-system package (MIT licensed,
`github.com/GovTechSG/sgds-web-component`), as a Lit template rather than a
loose `.svg` file:

```bash
npm pack @govtechsg/sgds-web-component          # downloads the tarball
tar -xzf govtechsg-sgds-web-component-*.tgz \
    package/components/Icon/icons/sg-crest.js
```

`sg-crest.js` wraps a complete `<svg xmlns="http://www.w3.org/2000/svg"
width="24" height="24" viewBox="0 0 24 24">` element in a `` html` ``
template literal. Copy the `<svg>…</svg>` block out verbatim — do not alter
the paths or the `#DB0000` fill — and save it as `sg-crest.svg`.

Note: `@govtechsg/sgds` (v2, the Bootstrap-based package) ships CSS and Sass
only. It has no `assets/` directory and does not contain the crest.

Your agency's brand/communications team is the other valid source, and is
the right route if you need written confirmation of approved use.

## `pub-logo.svg` — bundled, consent not yet documented

The application header (`src/components/layout/AppLayout.tsx`, DSS control
TL-2) renders the PUB logo from `/pub-logo.svg`, wrapped in a link to
`https://www.pub.gov.sg`. Rendered at 26 px high, width auto.

The file is the official artwork, taken unmodified from PUB's own site:

```
pub.gov.sg/-/media/Images/Feature/Navigation/PUB-logo-bw-new.svg
```

It is the white-on-dark variant (220 × 41 viewBox, all paths `fill="white"`),
which is why it suits the `#1a3a5c` header bar and would be invisible on a
light background. If you restyle the header, get the appropriate variant
rather than recolouring this one.

**Outstanding: written confirmation of approved use.** The site's Terms of
Use (`pub.gov.sg/termsofuse`) say no part of its materials may be reproduced
or displayed *"without the prior written consent of PUB."* That clause is
aimed at third parties, and this is a PUB service carrying PUB's own mark —
but no consent is on record. Ask PUB's communications or brand team to
confirm before public launch. If they supply a different approved variant,
replace this file; no code change is needed.

If the file is ever removed the header degrades gracefully: the `<img>`
`onError` handler swaps in a plain "PUB" text wordmark, still wrapped in the
link to `pub.gov.sg`.

Until the file is present the banner degrades gracefully — the `<img>`
`onError` handler hides the slot and the banner renders with its text only,
which is still readable and correctly positioned. Add the crest before
production sign-off.

## Anti-scam advisory copy — no asset, provenance recorded here

`src/components/layout/ScamAdvisoryBanner.tsx` ships **no file** — it is text
and inline styles only, so nothing lands in `public/`. Its provenance is
recorded here because the copy and the palette are reproduced from another
site, and that is the same class of question the two entries above answer.

Source: the live advisory on `https://www.pub.gov.sg`, read from the rendered
DOM on **2026-08-04**. PUB serves it as a Bootstrap
`div.alert.alert-primary.main-alert.alert-dismissible`. Reproduced verbatim:

> **Government officials will NEVER ask you to transfer money or disclose bank
> log-in details over a phone call.**
> Call the 24/7 ScamShield Helpline at 1799 if you are unsure if something is a
> scam. For more information, visit www.scamshield.gov.sg.

Palette taken from the same element — background `#f8f3d6`, headline `#344054`,
body `#2e2f33` — with the link recoloured to the app's own navy `#1a3a5c`. All
three pairs were contrast-checked before shipping (9.36:1, 11.96:1, 10.41:1)
and the ratios are recorded in the component docblock.

**No consent question arises.** This is whole-of-government public-safety
messaging carrying no agency mark, reproduced by a PUB service, and it is
already published for exactly this purpose. That is a different position from
the crest and the logo above, both of which are protected artwork.

Three deliberate differences from PUB's markup, each explained in the component
docblock: `role="region"` with a label instead of `role="alert"`; `https://` on
the ScamShield link where PUB still uses `http://`; and "opens in a new tab" in
the link's accessible name, matching the `TL-2` idiom used for the agency mark.
