# Static assets

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

Until the file is present the banner degrades gracefully — the `<img>`
`onError` handler hides the slot and the banner renders with its text only,
which is still readable and correctly positioned. Add the crest before
production sign-off.
