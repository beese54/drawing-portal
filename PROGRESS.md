# Schematic Drawing Portal — Progress & Status

## Original Repo (Baseline)

- **16 symbols**: gate valve, check valve, pump, flow meter, tee junction, elbow/bend, reducer, water heater, water tank, water meter, water fittings, fire hydrant, sump/manhole, water pipe, hot water pipe, cold water pipe
- **3 compliance checks**: Reg 28 (backflow), HB 2.2.1 (mode of supply — thresholds later corrected), HB 7.2.1 (MWELS)
- Hydraulic analysis — network pressure solver
- RAG knowledge base — ChromaDB over PUB Handbook & Regulations
- Dual LLM — GPT-4o-mini and Qwen 2.5-72B
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
- New backend agents: `hot_water_contamination_check`, `long_bath_check`, `section3_pipe_check`, `tank_pump_check`

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
- **PDF background layer** — import a PDF as a canvas underlay
- **Annotations layer** — add text labels to the canvas; editable width/height with edit-mode and display-mode now pixel-matched; included in the JSON metadata export (with MRL elevation) so notes like "valve normally closed" carry through to compliance review
- **Sheet setup modal** — paper size, drawing scale, title block
- **Templates** — pre-built schematic starting points, including annotation support. Available: 2-storey residential, 2x pump manifold (with and without bypass)
- **Pipe colouring** by type (cold = blue, hot = red) — tee/elbow tint now correctly traces through pumps (which don't change fluid type) and stops only at genuine fluid-transforming/originating symbols (water heater, tanks)

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

- [ ] **Verify:** RAG knowledge base and AI evaluation still functional on deployed instance?
- [ ] **Verify:** Symbol manager (custom SVG upload)
- [ ] Auto-insert for vb_and_check_valve rule (bidet spray) — done; consider extending double-click auto-insert pattern to other warning types (MWELS rating, long bath capacity) if useful
- [ ] _(add items here)_

---