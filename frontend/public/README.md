# Static assets

Files here are copied to the site root by Vite at build time and are served
as `/<filename>`.

## `sg-crest.svg` — required, not bundled

The Official Government Banner (`src/components/layout/Masthead.tsx`, DSS
control TL-3) renders the Singapore lion-head crest from `/sg-crest.svg`.

**That file is deliberately not committed here.** The lion head is a
protected national symbol under the Singapore Arms and Flag and National
Anthem Act — it must be the official artwork, not a redrawn approximation.

To add it, take the crest asset from one of these official sources and save
it as `frontend/public/sg-crest.svg`:

- the `@govtechsg/sgds` package (`node_modules/@govtechsg/sgds/assets/`), or
- the Singapore Government Design System masthead component, or
- your agency's brand/communications team.

Until the file is present the banner degrades gracefully — the `<img>`
`onError` handler hides the slot and the banner renders with its text only,
which is still readable and correctly positioned. Add the crest before
production sign-off.
