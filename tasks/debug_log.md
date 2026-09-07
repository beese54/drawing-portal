# Debug log — schematic JSON import boundary

Pattern B (Autonomous Debugger). Two defects found while answering "what happens
if a user imports an incorrect JSON file?" — both deterministic, so the N-run rule
for intermittent bugs does not apply.

## Phase 0 — Repro

`tasks/repro/import_validation.repro.mjs`. There is no test runner in
`frontend/package.json`, so the harness compiles `src/utils/importValidation.ts`
with the esbuild already in `node_modules` and drives it under Node.

Pre-fix: **16 of 22 cases failing.** Every failing case was a malformed file the
app *accepted*.

## Phase 1/2 — Hypothesis ledger

| # | Hypothesis | Predicted evidence | Test | Result |
|---|---|---|---|---|
| 1 | `validateSchematicShape` checks that `position` is an object but never that `canvas_x`/`canvas_y` are numbers, so non-numeric geometry reaches the canvas as `undefined` | A file with `position: {}` passes validation | repro cases 2–9 | **CONFIRMED** — accepted pre-fix, refused post-fix |
| 2 | `sheet_config` is consumed unvalidated, so an unknown paper size reaches `setSheetConfig` | `paper_size: "Z9"` passes | repro cases 13–14 | **CONFIRMED** |
| 3 | Annotations are only length-checked, never shape-checked, so a missing `position` becomes a TypeError shown as "Failed to import schematic: Cannot read properties of undefined" | `delete annotations[0].position` passes validation | repro cases 10–12 | **CONFIRMED** |
| 4 | `sanitizeTitleBlock` drops a rejected stamp with no signal to any caller | A remote-URL stamp is dropped and nothing is reported | repro stamp cases | **CONFIRMED** |

## Phase 3 — Fix at the root

**#1 — geometry is validated, not assumed.** `requireNumber` / `requirePoint` in
`importValidation.ts` refuse the file when element positions, element width/height,
pipe start/end, or annotation positions are not finite numbers. Refusal rather than
dropping, because a drawing whose geometry cannot be read is not a coherent drawing —
that is the line the rest of the file already draws. `sheet_config` gains an allowlist
check (paper sizes read from `PAPER_SIZES_MM` so the two cannot drift).

Softer numerics are defaulted rather than fatal, so genuinely older 1.0 exports still
open: `rotation_deg` → 0; annotation `font_size` → `DEFAULT_ANNOTATION_FONT_SIZE`,
`max_width` → `fontSize * 20`, `height` → `fontSize * 1.35 * 2` (both mirror how the
app itself creates an annotation). `importTankProperties`'s `num()` now runs through
`safeNumber` instead of a bare null check.

**#3 — dropped stamps are reported.** `sanitizeTitleBlock` and
`reencodeTitleBlockStamps` take an optional `onDrop` reporter; `useJsonImport`
collects the fields and, after the drawing loads, tells the user which stamp was
removed and to re-attach it. Dropping is unchanged — only the silence is.
Deliberately scoped to stamps: a dropped pipe colour is cosmetic, a dropped LP/PE
stamp is a missing signature on a regulatory drawing.

## Phase 4/5 — Proof

- Repro: **22/22 pass** (was 6/22).
- `tsc --noEmit`: clean.
- `vite build`: clean, built in 7.11s.
- Backend `pytest -q`: **140 passed**. Backend was not touched; run as a regression check.
- `npm run lint` is **broken independently of this change** — ESLint 8 finds no config
  file in the repo. Pre-existing, not introduced here, not fixed here.
- Diff touches only `importValidation.ts`, `useJsonImport.ts`, and the new
  `tasks/repro/` harness.

## Known gap, deliberately not closed

`reencodeTitleBlockStamps` needs `Image` and `<canvas>`, so the repro harness covers
only the first of the two stamp layers under Node. The second layer's reporting is
wired identically and typechecks, but is exercised only in a browser.
