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
- **SEC721** enhanced — dedicated fixture symbols tracked separately; non-MWELS appliances (dishwasher, washing machine) excluded
- **TANK_PUMP** added — tank/pump installation requirements (PUB / SS 245 / SS 636)
- New backend agents: `hot_water_contamination_check`, `long_bath_check`, `section3_pipe_check`, `tank_pump_check`

---

### Canvas Features

- **Real-time `!` warning badges** on the canvas for:
  - Backflow risk symbols (bidet spray, hose connections) — with hover tooltips explaining the regulation
  - Long bath exceeding 250L capacity limit — with hover tooltip
  - MWELS-applicable fixtures with no efficiency rating set — with hover tooltip
- **Badge consistency** — all `!` badges use the same style (orange, same size, same positioning)
- **Symbol properties popover** — double-clicking a symbol (or clicking its `!` MWELS badge) opens a small floating panel to the right of the symbol showing:
  - Dual supply ports (hot + cold) toggle and swap, for applicable symbols
  - MWELS water efficiency tick rating (2✓ or 3✓✓✓), for applicable fixtures
  - Closes on click-outside
- **Ctrl+scroll** — browser zoom disabled globally when Ctrl is held; canvas zoom still works normally
- **Long bath capacity panel** — floating panel appears on select
- **Water tank properties modal** — double-click to open
- **PDF background layer** — import a PDF as a canvas underlay
- **Annotations layer** — add text labels to the canvas
- **Sheet setup modal** — paper size, drawing scale, title block
- **Templates** — pre-built schematic starting points
- **Pipe colouring** by type (cold = blue, hot = red)

---

## Pending / What's Next

- [ ] **Verify:** RAG knowledge base and AI evaluation still functional on deployed instance?
- [ ] **Verify:** Symbol manager (custom SVG upload)
- [ ] _(add items here)_

---