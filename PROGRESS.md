# Schematic Drawing Portal — Progress & Status

## Original Repo (Baseline)

- **16 symbols**: gate valve, check valve, pump, flow meter, tee junction, elbow/bend, reducer, water heater, water tank, water meter, water fittings, fire hydrant, sump/manhole, water pipe, hot water pipe, cold water pipe
- **3 compliance checks**: Reg 28 (backflow), HB 2.2.1 (mode of supply — thresholds later corrected), HB 7.2.1 (MWELS)
- Symbol manager — upload custom SVG/PNG
- Docker / K8s deployment configs

---

## What Has Been Done

### Symbol Library: 16 → 63 symbols

Removed: `fire_hydrant`, `reducer`, `sump_manhole`

Added (50+):

| Category | Symbols |
|---|---|
| Valves | Globe valve, solenoid valve, motorised valve, multiport valve, cap-off valve, PRV with sensor, pressure relief valve, vacuum breaker, auto air relief valve, ball float valve |
| Metering | Sub-meter, pressure gauge (cock), pressure gauge (PRV), sight glass, sampling tap |
| Piping fittings | Flexible connection, puddle flange, pipe blank off, tap point schematic, water hammer absorber, strainer, Y-type strainer |
| Pumps & tanks | Jockey pump, cold water tank, pressure vessel, vortex inhibitor, tank air vent, level sensor/switch, vent cowl, control panel |
| Fixtures — Taps | Single tap, twin tap, single tap combined, bib tap (CW cap & lock) |
| Fixtures — Showers | Shower head, multiple shower unit, shower bath |
| Fixtures — Baths | Long bath, square bath, foot bath |
| Fixtures — Sanitary | Wash basin (rectangular), sink, water closet, urinal (wall), bidet spray, WC/UR isolator |
| Fixtures — Other | Drinking fountain (pedestal, trough, wall), washing machine, dishwasher, water dispenser |

---

### Compliance Checks: 3 → 4 checks

- **REG28** extended — backflow risk now covers bidet spray and hose connections, not just water heaters
- **SEC221** corrected — elevation thresholds fixed from 125 m / 137 m to **25 m / 37 m AMSL**
- **SEC721** enhanced — dedicated fixture symbols tracked separately; washing machine & dishwasher graded on their own 1-4 tick MWELS scale (L/kg, L/place-setting), water dispenser & landscape tap remain the only true non-MWELS exclusions; a fitting with no declared tick rating now fails the check instead of just warning
- **TANK_PUMP** added — tank/pump installation requirements (PUB / SS 245 / SS 636)
- **HIGHEST_FITTING** added (2026-07-27) — requires exactly one "Highest Direct Supply Fitting" marker (with a user-declared AMSL elevation) whenever a fitting on direct supply is present, so the plan checker can read the elevation straight off the drawing. Shares its "possibly on direct supply" classification with SEC221's `check_supply_mode` via one extracted predicate (`is_possibly_direct_supply`) so an ambiguous/mixed-supply fitting can't be treated as direct by one check and silently skipped by the other.
- New backend agents: `hot_water_contamination_check`, `long_bath_check`, `section3_pipe_check`, `tank_pump_check`, `highest_fitting_check`

---

### Canvas Features

- **Real-time `!` warning badges** on the canvas for:
  - Backflow risk symbols (bidet spray, water heater, washing machine, dishwasher, water dispenser, bib tap) — with hover tooltips explaining the regulation
  - Long bath exceeding 250L capacity limit — with hover tooltip
  - MWELS-applicable fixtures with no efficiency rating set — with hover tooltip
- **One-click backflow protection assembly insert** — double-click a backflow-risk `!` badge to auto-insert the required protection assembly upstream, correctly oriented to match the fitting's actual rotation:
  - SS636 §6.4 (water heater, washing machine, dishwasher, water dispenser, bib tap) → Gate Valve + 2 Check Valves
  - SS636 §6.5 (bidet spray) → Gate Valve + Check Valve + Vacuum Breaker
  - Dual-supply fixtures (e.g. washing machine with Hot + Cold enabled) get an independent assembly per supply line, skipping any line that's already protected
  - Same assembly also offered automatically via a toast when drag-connecting a backflow-risk fitting to a pipe
- **Badge consistency** — all `!` badges use the same style (orange, same size, same positioning)
- **Symbol properties popover** — double-clicking a symbol (or clicking its `!` MWELS badge) opens a small floating panel to the right of the symbol showing:
  - Dual supply ports (hot + cold) toggle and swap, for applicable symbols
  - MWELS water efficiency tick rating (2✓/3✓✓✓ for taps/cisterns/valves; 1-4✓ for washing machine & dishwasher), for applicable fixtures
  - Closes on click-outside
- **Ctrl+scroll** — browser zoom disabled globally when Ctrl is held; canvas zoom still works normally
- **Long bath capacity panel** — floating panel appears on select
- **Water tank properties modal** — double-click to open
- **Annotations layer** — add text labels to the canvas; editable width/height with edit-mode and display-mode now pixel-matched; included in the JSON metadata export (with MRL elevation) so notes like "valve normally closed" carry through to compliance review
- **Sheet setup modal** — paper size, drawing scale, title block
- **Templates** — pre-built schematic starting points, including annotation support. Available: 2-storey residential, 2x pump manifold (with and without bypass)
- **Pipe colouring** by type (cold = blue, hot = red) — tee/elbow tint now correctly traces through pumps (which don't change fluid type) and stops only at genuine fluid-transforming/originating symbols (water heater, tanks)
- **Pipe colour customisation, dashed hot pipes & crossing jump arcs** (2026-07-26) — Word-style click-to-recolor per pipe (multi-select supported), persistent per-type default colours + a shared recent-colors palette (max 3, in localStorage), explicit "Reset This Pipe"/reset-to-type-default controls. Hot pipes render dashed, cold/generic always solid. Where two pipes cross without connecting, the losing pipe (dashed loses to solid; same-style ties go to whichever is closer to vertical) detours with a small always-solid arc "jump" — mimics the AutoCAD convention of showing non-connecting crossings. All of it survives PDF export (matching dash/jump rendering) and JSON export/import round-trip.
- **Pipe diameter labels & Highest Direct Supply Fitting marker** (2026-07-27) — freeform "ØXXmm"-style size label per pipe (multi-select + mixed-selection aware, like the color panel), shown beside the pipe's flow arrow on canvas/PDF, round-trips through JSON export/import; splitting a labeled pipe keeps the label on the segment nearest the original start rather than duplicating it onto both halves. Plus a new standalone "Highest Direct Supply Fitting" marker symbol + elevation-entry dialog feeding the HIGHEST_FITTING compliance check (see above).
- **Editable annotation font sizes** (2026-07-27) — annotation insert menu offers a combobox of preset sizes plus freeform typing instead of a fixed S/M/L, remembering the last-used size as the next default. Context menus (annotation insert, mirror) and the annotation text editor now share a `useClampToViewport` hook so they stay on-screen near a viewport edge instead of overflowing it.

---

## Session Fixes — 2026-07-27

Ran a `/code-review` pass on the pipe-diameter-label + Highest Direct Supply Fitting feature set before commit and fixed all 5 findings:

- **Highest-Fitting elevation label detaching during drag** — the label was rendered as a sibling Text node keyed to the store's element position, which only updates on drag-end; it visibly lagged a full drag behind the marker while dragging. Fixed by having `SymbolNode.tsx` report live drag position via two new optional callbacks (`onDragPositionChange`/`onDragFinished`), consumed only for this one symbol in `ElementsLayer.tsx`.
- **Duplicate diameter label after splitting a labeled pipe** — inserting a fitting/valve mid-run onto a labeled pipe was copying the "ØXXmm" label onto both resulting segments, showing two identical labels clustered around the new symbol. `derivePipe()` no longer auto-copies `diameterLabel`; callers now pass it explicitly only on the segment that should keep it.
- **HIGHEST_FITTING check could silently skip a mixed-supply fitting** — it required `supply_mode == "direct_supply"` exactly, but a dual-supply fitting with disagreeing ports is deliberately left `null` (ambiguous) by `buildSupplyModes`, and the existing SEC221 check already treats that ambiguity as "possibly direct". Extracted one shared predicate (`is_possibly_direct_supply`) so the two checks can't independently drift apart on this again; added a regression test.
- **Pipe body/arrow Konva node count** — confirmed as an intentional tradeoff (the flow arrow was decoupled from the pipe body so it can sit at the true midpoint regardless of jump-arc segments) rather than a bug; added `perfectDrawEnabled={false}` as a cheap, safe perf mitigation.
- **PipeDiameterPanel duplicating PipeColorPanel's mixed-selection logic** — the same "bucket by value, detect mixed" pattern (which had already caused a real bug in the color panel, see 2026-07-26 below) was hand-rolled a second time; extracted into a shared `mixedPipeValue.ts` helper.

---

## Session Fixes — 2026-07-26

- **Elbow bend / tee junction click precision** — their hit area was the full symbol bounding box, so an empty corner of the box would swallow a click meant for a pipe endpoint terminating there; replaced with a precise hand-traced hit path following the actual glyph ink. Same treatment later extended to 4 more thin-line-art symbols: flexible connection, Y-type strainer, puddle flange, pipe blank off.
- **Pipe click hit area retuned twice** — first restored from a regression (had drifted to a much wider area during an earlier refactor) to its original tuned value, then tightened further (`hitStrokeWidth` 4→3, symbol `HIT_PADDING_PX` 2→1) after direct testing showed the wider value made overlapping symbols hard to click. Found and worked around a Konva-internal edge case along the way: a dashed (hot) pipe split into multiple pieces by a jump arc becomes entirely unclickable at `hitStrokeWidth<=2` — a plain dashed pipe or a jumping solid pipe are both unaffected, so it's specific to the dashed+multi-segment combination. 3 is the lowest value confirmed reliable.
- **Jump-arc dash-phase inconsistency** — arcs used to render as part of one continuous dashed path with the rest of the pipe, so identically-sized crossings could look different (a full clean hook vs. one that looked "cut short") purely depending on how far along the pipe's dash cycle a given crossing happened to fall. Fixed by rendering each pipe as separate straight-run/arc-bulge pieces, with the arc bulge always solid regardless of the pipe's own dash pattern.
- Ran a full `/code-review` pass on the pipe-styling feature set and fixed all 9 findings, including two real bugs it didn't have to look far to catch: a mixed cold+hot pipe selection was collapsing into one misleading colour swatch, and the crossing-priority tie-break used array index as its final fallback (not stable across pipe-splitting edits elsewhere in the drawing).

---

## Session Fixes — 2026-07-03

- **Annotation sizing** — edit-mode textarea and display-mode rendering now use matching padding math, so text wraps identically in both; vertical resize was silently broken (height only ever synced from measured text, not the user's drag) — fixed to read from the store directly like width already did
- **Symbol rotation precision** — `rotateOffset()` used floating-point trig + rounding for 90/180/270° rotations, causing ports to drift up to ~0.5px off their true position (very visible zoomed in on 6px symbols); replaced with exact integer math for the four cardinal angles
- **Connection-status indicator** — was rendered as a 2px font glyph (`✓`/`✗`), which gets snapped by font hinting regardless of underlying precision; replaced with vector-drawn strokes for true sub-pixel accuracy
- **Group-drag false capture** — the "does this pipe endpoint belong to a moved symbol" match radius (2–3px) was large relative to 6px symbols, occasionally sweeping in unrelated nearby pipes on multi-select drag; tightened to 0.5px
- **Rubber-band selection visibility** — pipes captured by a drag-select box weren't highlighted in the live preview (only elements/annotations were), making the "N selected" count opaque; added the missing highlight
- **Y-type strainer geometry** — mirrored to match the real device's cross-section (mesh chamber/cleanout cap on the outlet side); Input/Output port sides corrected to match
- **Tee/elbow color tracing** — pumps were incorrectly treated as a fluid-type boundary (like a water heater), blocking cold/hot tint from propagating through a valve→pump→valve chain even though a pump doesn't change fluid type
- **Backflow assembly orientation** — component rotation is now computed per-component instead of once for the whole assembly, since components can have different native port axes (vacuum breaker defaults to vertical, check/gate valve to horizontal) — mixing them with a single shared rotation misoriented whichever component didn't match the assumed axis

---

## Pending / What's Next

- [x] ~~Verify symbol manager (custom SVG upload)~~ — **removed 2026-08-04**. The write API could not work: the production container filesystem is not writable and no storage is attached. Symbols are now added by committing an SVG and redeploying
- [x] Add the official Singapore lion-head crest at `frontend/public/sg-crest.svg` — done 2026-08-02, extracted from `@govtechsg/sgds-web-component` v3.25.0. Closes DSS TL-3
- [ ] **Publish a real support/contact channel (DSS BD-9)** — now the service's only route to its users. The placeholder "Report a Bug / Feedback" link was removed on 2026-08-01 and the in-app feedback dialog on 2026-08-02; neither was replaced. Also blocks PR-5, TL-4, WU-9 and both UU controls, which have no user-research instrument to rest on
- [ ] Auto-insert for vb_and_check_valve rule (bidet spray) — done; consider extending double-click auto-insert pattern to other warning types (MWELS rating, long bath capacity) if useful
- [ ] _(add items here)_

---