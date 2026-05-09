import type { CanvasElement, PipeElement } from '../types';

export interface Template {
  id: string;
  name: string;
  description: string;
  generate: () => { elements: CanvasElement[]; pipes: PipeElement[] };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const S = 48;

function el(
  symbolId: string,
  symbolName: string,
  x: number,
  y: number,
  rotation = 0,
  extras: Partial<CanvasElement> = {},
): CanvasElement {
  return { id: crypto.randomUUID(), symbolId, symbolName, x, y, rotation, width: S, height: S, ...extras };
}

function p(
  x1: number, y1: number,
  x2: number, y2: number,
  pipeType: 'cold' | 'hot' | 'generic' = 'cold',
): PipeElement {
  return { id: crypto.randomUUID(), pipeType, startX: x1, startY: y1, endX: x2, endY: y2 };
}

// Upstream/downstream port positions for inline elements (rot=0: left/right)
function iUp(x: number, y: number, rot: number): [number, number] {
  if (rot === 90)  return [x, y - 24];
  if (rot === 180) return [x + 24, y];
  if (rot === 270) return [x, y + 24];
  return [x - 24, y];
}
function iDn(x: number, y: number, rot: number): [number, number] {
  if (rot === 90)  return [x, y + 24];
  if (rot === 180) return [x - 24, y];
  if (rot === 270) return [x, y - 24];
  return [x + 24, y];
}

// Branch port of tee_junction
// rot=0 → down | rot=90 → left | rot=180 → up | rot=270 → right
function tBranch(x: number, y: number, rot: number): [number, number] {
  if (rot === 90)  return [x - 24, y];
  if (rot === 180) return [x, y - 24];
  if (rot === 270) return [x + 24, y];
  return [x, y + 24];
}

// ── Sub-branch helper ─────────────────────────────────────────────────────────
//
// Adds one fixture outlet going LEFT from a vertical main column.
// The tee at (bx, teeY, rot=90) already exists in the caller's element list.
// Gate valve at bx-100 (rot=180: upstream=right, downstream=left).
// Fixture at bx-180 with its upstream port on the right side.
//
// Fixture upstream-on-right rotations:
//   water_closet   → rot=90   (port offsetY=-24 → right after 90° rotation)
//   water_fittings → rot=90   (port offsetY=-24 → right after 90° rotation)
//   shower_head    → rot=90   (port offsetY=-24 → right after 90° rotation)
//   wash_basin     → rot=270  (port offsetY=+24 → right after 270° rotation)
//   long_bath      → rot=180  (port offsetX=-24 → right after 180° rotation)

const SUB_GV_OFFSET  = 100;
const SUB_FIX_OFFSET = 180;

function addLeft(
  elements: CanvasElement[],
  pipes:    PipeElement[],
  bx: number,
  teeY: number,
  fixId: string,
  fixName: string,
  fixRot: number,
  pt: 'cold' | 'hot' = 'cold',
  extras: Partial<CanvasElement> = {}
) {
  const gvX  = bx - SUB_GV_OFFSET;
  const fixX = bx - SUB_FIX_OFFSET;
  elements.push(el('gate_valve', 'Gate Valve', gvX, teeY, 180));
  elements.push(el(fixId, fixName, fixX, teeY, fixRot, extras));
  // tee branch (left) → GV right (upstream)
  pipes.push(p(...tBranch(bx, teeY, 90), ...iUp(gvX, teeY, 180), pt));
  // GV left (downstream) → fixture right (upstream)
  pipes.push(p(...iDn(gvX, teeY, 180), fixX + 24, teeY, pt));
}

// ── Master Bathroom ───────────────────────────────────────────────────────────
// Cold: WC · WM · TAP · WB   |   Hot: SH+ · LB · ST

function makeMasterBath(bx: number, branchStartY: number) {
  const els: CanvasElement[] = [];
  const ps:  PipeElement[]   = [];

  const GV_Y    = branchStartY +  40;
  const WC_Y    = branchStartY + 110;
  const WM_Y    = branchStartY + 170;
  const TAP_Y   = branchStartY + 230;
  const WB_Y    = branchStartY + 290;
  const CHECK_Y = branchStartY + 350;
  const WH_Y    = branchStartY + 420;
  const SH_Y    = branchStartY + 490;
  const LB_Y    = branchStartY + 550;
  const ST_Y    = branchStartY + 610;

  els.push(
    el('gate_valve',   'Gate Valve',   bx, GV_Y,    90),
    el('tee_junction', 'Tee Junction', bx, WC_Y,    90),
    el('tee_junction', 'Tee Junction', bx, WM_Y,    90),
    el('tee_junction', 'Tee Junction', bx, TAP_Y,   90),
    el('tee_junction', 'Tee Junction', bx, WB_Y,    90),
    el('check_valve',  'Check Valve',  bx, CHECK_Y, 90),
    el('water_heater', 'Water Heater', bx, WH_Y,    90),
    el('tee_junction', 'Tee Junction', bx, SH_Y,    90),
    el('tee_junction', 'Tee Junction', bx, LB_Y,    90),
    el('tee_junction', 'Tee Junction', bx, ST_Y,    90),
  );

  ps.push(
    p(bx, branchStartY,         ...iUp(bx, GV_Y,    90)),
    p(...iDn(bx, GV_Y,    90),  ...iUp(bx, WC_Y,    90)),
    p(...iDn(bx, WC_Y,    90),  ...iUp(bx, WM_Y,    90)),
    p(...iDn(bx, WM_Y,    90),  ...iUp(bx, TAP_Y,   90)),
    p(...iDn(bx, TAP_Y,   90),  ...iUp(bx, WB_Y,    90)),
    p(...iDn(bx, WB_Y,    90),  ...iUp(bx, CHECK_Y, 90)),
    p(...iDn(bx, CHECK_Y, 90),  ...iUp(bx, WH_Y,    90)),
    p(...iDn(bx, WH_Y,    90),  ...iUp(bx, SH_Y,    90), 'hot'),
    p(...iDn(bx, SH_Y,    90),  ...iUp(bx, LB_Y,    90), 'hot'),
    p(...iDn(bx, LB_Y,    90),  ...iUp(bx, ST_Y,    90), 'hot'),
  );

  addLeft(els, ps, bx, WC_Y,  'water_closet',   'Water Closet',    90);
  addLeft(els, ps, bx, WM_Y,  'water_fittings', 'Washing Machine', 90, 'cold', { fittingType: 'basin_tap' });
  addLeft(els, ps, bx, TAP_Y, 'water_fittings', 'Tap Point',       90, 'cold', { fittingType: 'basin_tap' });
  addLeft(els, ps, bx, WB_Y,  'wash_basin',     'Wash Basin',     270);
  addLeft(els, ps, bx, SH_Y,  'shower_head',    'Shower Head',     90, 'hot');
  addLeft(els, ps, bx, LB_Y,  'long_bath',      'Long Bath',      180, 'hot');
  addLeft(els, ps, bx, ST_Y,  'water_fittings', 'Shower Tap',      90, 'hot', { fittingType: 'shower_tap' });

  return { elements: els, pipes: ps };
}

// ── Standard Bathroom (Bath 2 / Bath 3) ──────────────────────────────────────
// Cold: WC · WM · WB   |   Hot: SH+ · ST

function makeStandardBath(bx: number, branchStartY: number) {
  const els: CanvasElement[] = [];
  const ps:  PipeElement[]   = [];

  const GV_Y    = branchStartY +  40;
  const WC_Y    = branchStartY + 110;
  const WM_Y    = branchStartY + 170;
  const WB_Y    = branchStartY + 230;
  const CHECK_Y = branchStartY + 290;
  const WH_Y    = branchStartY + 360;
  const SH_Y    = branchStartY + 430;
  const ST_Y    = branchStartY + 490;

  els.push(
    el('gate_valve',   'Gate Valve',   bx, GV_Y,    90),
    el('tee_junction', 'Tee Junction', bx, WC_Y,    90),
    el('tee_junction', 'Tee Junction', bx, WM_Y,    90),
    el('tee_junction', 'Tee Junction', bx, WB_Y,    90),
    el('check_valve',  'Check Valve',  bx, CHECK_Y, 90),
    el('water_heater', 'Water Heater', bx, WH_Y,    90),
    el('tee_junction', 'Tee Junction', bx, SH_Y,    90),
    el('tee_junction', 'Tee Junction', bx, ST_Y,    90),
  );

  ps.push(
    p(bx, branchStartY,         ...iUp(bx, GV_Y,    90)),
    p(...iDn(bx, GV_Y,    90),  ...iUp(bx, WC_Y,    90)),
    p(...iDn(bx, WC_Y,    90),  ...iUp(bx, WM_Y,    90)),
    p(...iDn(bx, WM_Y,    90),  ...iUp(bx, WB_Y,    90)),
    p(...iDn(bx, WB_Y,    90),  ...iUp(bx, CHECK_Y, 90)),
    p(...iDn(bx, CHECK_Y, 90),  ...iUp(bx, WH_Y,    90)),
    p(...iDn(bx, WH_Y,    90),  ...iUp(bx, SH_Y,    90), 'hot'),
    p(...iDn(bx, SH_Y,    90),  ...iUp(bx, ST_Y,    90), 'hot'),
  );

  addLeft(els, ps, bx, WC_Y, 'water_closet',   'Water Closet',    90);
  addLeft(els, ps, bx, WM_Y, 'water_fittings', 'Washing Machine', 90, 'cold', { fittingType: 'basin_tap' });
  addLeft(els, ps, bx, WB_Y, 'wash_basin',     'Wash Basin',     270);
  addLeft(els, ps, bx, SH_Y, 'shower_head',    'Shower Head',     90, 'hot');
  addLeft(els, ps, bx, ST_Y, 'water_fittings', 'Shower Tap',      90, 'hot', { fittingType: 'shower_tap' });

  return { elements: els, pipes: ps };
}

// ── Bath 1 ────────────────────────────────────────────────────────────────────
// Cold: WC · WM · WB   |   Hot: SH+ · BT (bath tap)

function makeBath1(bx: number, branchStartY: number) {
  const els: CanvasElement[] = [];
  const ps:  PipeElement[]   = [];

  const GV_Y    = branchStartY +  40;
  const WC_Y    = branchStartY + 110;
  const WM_Y    = branchStartY + 170;
  const WB_Y    = branchStartY + 230;
  const CHECK_Y = branchStartY + 290;
  const WH_Y    = branchStartY + 360;
  const SH_Y    = branchStartY + 430;
  const BT_Y    = branchStartY + 490;

  els.push(
    el('gate_valve',   'Gate Valve',   bx, GV_Y,    90),
    el('tee_junction', 'Tee Junction', bx, WC_Y,    90),
    el('tee_junction', 'Tee Junction', bx, WM_Y,    90),
    el('tee_junction', 'Tee Junction', bx, WB_Y,    90),
    el('check_valve',  'Check Valve',  bx, CHECK_Y, 90),
    el('water_heater', 'Water Heater', bx, WH_Y,    90),
    el('tee_junction', 'Tee Junction', bx, SH_Y,    90),
    el('tee_junction', 'Tee Junction', bx, BT_Y,    90),
  );

  ps.push(
    p(bx, branchStartY,         ...iUp(bx, GV_Y,    90)),
    p(...iDn(bx, GV_Y,    90),  ...iUp(bx, WC_Y,    90)),
    p(...iDn(bx, WC_Y,    90),  ...iUp(bx, WM_Y,    90)),
    p(...iDn(bx, WM_Y,    90),  ...iUp(bx, WB_Y,    90)),
    p(...iDn(bx, WB_Y,    90),  ...iUp(bx, CHECK_Y, 90)),
    p(...iDn(bx, CHECK_Y, 90),  ...iUp(bx, WH_Y,    90)),
    p(...iDn(bx, WH_Y,    90),  ...iUp(bx, SH_Y,    90), 'hot'),
    p(...iDn(bx, SH_Y,    90),  ...iUp(bx, BT_Y,    90), 'hot'),
  );

  addLeft(els, ps, bx, WC_Y, 'water_closet',   'Water Closet',    90);
  addLeft(els, ps, bx, WM_Y, 'water_fittings', 'Washing Machine', 90, 'cold', { fittingType: 'basin_tap' });
  addLeft(els, ps, bx, WB_Y, 'wash_basin',     'Wash Basin',     270);
  addLeft(els, ps, bx, SH_Y, 'shower_head',    'Shower Head',     90, 'hot');
  addLeft(els, ps, bx, BT_Y, 'water_fittings', 'Bath Tap',        90, 'hot', { fittingType: 'basin_tap' });

  return { elements: els, pipes: ps };
}

// ── Wet Kitchen ───────────────────────────────────────────────────────────────
// Cold: TAP · TAP2 · WM   |   Hot: Sink Tap

function makeWetKitchen(bx: number, branchStartY: number) {
  const els: CanvasElement[] = [];
  const ps:  PipeElement[]   = [];

  const GV_Y    = branchStartY +  40;
  const TAP1_Y  = branchStartY + 110;
  const TAP2_Y  = branchStartY + 170;
  const WM_Y    = branchStartY + 230;
  const CHECK_Y = branchStartY + 290;
  const WH_Y    = branchStartY + 360;
  const SK_Y    = branchStartY + 430;

  els.push(
    el('gate_valve',   'Gate Valve',   bx, GV_Y,   90),
    el('tee_junction', 'Tee Junction', bx, TAP1_Y, 90),
    el('tee_junction', 'Tee Junction', bx, TAP2_Y, 90),
    el('tee_junction', 'Tee Junction', bx, WM_Y,   90),
    el('check_valve',  'Check Valve',  bx, CHECK_Y, 90),
    el('water_heater', 'Water Heater', bx, WH_Y,   90),
    el('tee_junction', 'Tee Junction', bx, SK_Y,   90),
  );

  ps.push(
    p(bx, branchStartY,          ...iUp(bx, GV_Y,   90)),
    p(...iDn(bx, GV_Y,   90),    ...iUp(bx, TAP1_Y, 90)),
    p(...iDn(bx, TAP1_Y, 90),    ...iUp(bx, TAP2_Y, 90)),
    p(...iDn(bx, TAP2_Y, 90),    ...iUp(bx, WM_Y,   90)),
    p(...iDn(bx, WM_Y,   90),    ...iUp(bx, CHECK_Y, 90)),
    p(...iDn(bx, CHECK_Y, 90),   ...iUp(bx, WH_Y,   90)),
    p(...iDn(bx, WH_Y,   90),    ...iUp(bx, SK_Y,   90), 'hot'),
  );

  addLeft(els, ps, bx, TAP1_Y, 'water_fittings', 'Sink Tap',        90, 'cold', { fittingType: 'sink_tap' });
  addLeft(els, ps, bx, TAP2_Y, 'water_fittings', 'Sink Tap 2',      90, 'cold', { fittingType: 'sink_tap' });
  addLeft(els, ps, bx, WM_Y,   'water_fittings', 'Washing Machine', 90, 'cold', { fittingType: 'basin_tap' });
  addLeft(els, ps, bx, SK_Y,   'water_fittings', 'Sink Tap (Hot)',  90, 'hot',  { fittingType: 'sink_tap' });

  return { elements: els, pipes: ps };
}

// ── Dry Kitchen ───────────────────────────────────────────────────────────────
// Cold: TAP · TAP2

function makeDryKitchen(bx: number, branchStartY: number) {
  const els: CanvasElement[] = [];
  const ps:  PipeElement[]   = [];

  const GV_Y   = branchStartY +  40;
  const TAP1_Y = branchStartY + 110;
  const TAP2_Y = branchStartY + 170;

  els.push(
    el('gate_valve',   'Gate Valve',   bx, GV_Y,   90),
    el('tee_junction', 'Tee Junction', bx, TAP1_Y, 90),
    el('tee_junction', 'Tee Junction', bx, TAP2_Y, 90),
  );

  ps.push(
    p(bx, branchStartY,        ...iUp(bx, GV_Y,   90)),
    p(...iDn(bx, GV_Y,   90),  ...iUp(bx, TAP1_Y, 90)),
    p(...iDn(bx, TAP1_Y, 90),  ...iUp(bx, TAP2_Y, 90)),
  );

  addLeft(els, ps, bx, TAP1_Y, 'water_fittings', 'Sink Tap',   90, 'cold', { fittingType: 'sink_tap' });
  addLeft(els, ps, bx, TAP2_Y, 'water_fittings', 'Sink Tap 2', 90, 'cold', { fittingType: 'sink_tap' });

  return { elements: els, pipes: ps };
}

// ── Toilet ────────────────────────────────────────────────────────────────────
// Cold: WC · WM · TAP

function makeToilet(bx: number, branchStartY: number) {
  const els: CanvasElement[] = [];
  const ps:  PipeElement[]   = [];

  const GV_Y  = branchStartY +  40;
  const WC_Y  = branchStartY + 110;
  const WM_Y  = branchStartY + 170;
  const TAP_Y = branchStartY + 230;

  els.push(
    el('gate_valve',   'Gate Valve',   bx, GV_Y,  90),
    el('tee_junction', 'Tee Junction', bx, WC_Y,  90),
    el('tee_junction', 'Tee Junction', bx, WM_Y,  90),
    el('tee_junction', 'Tee Junction', bx, TAP_Y, 90),
  );

  ps.push(
    p(bx, branchStartY,        ...iUp(bx, GV_Y,  90)),
    p(...iDn(bx, GV_Y,  90),   ...iUp(bx, WC_Y,  90)),
    p(...iDn(bx, WC_Y,  90),   ...iUp(bx, WM_Y,  90)),
    p(...iDn(bx, WM_Y,  90),   ...iUp(bx, TAP_Y, 90)),
  );

  addLeft(els, ps, bx, WC_Y,  'water_closet',   'Water Closet',    90);
  addLeft(els, ps, bx, WM_Y,  'water_fittings', 'Washing Machine', 90, 'cold', { fittingType: 'basin_tap' });
  addLeft(els, ps, bx, TAP_Y, 'water_fittings', 'Tap Point',       90, 'cold', { fittingType: 'basin_tap' });

  return { elements: els, pipes: ps };
}

// ── Standard Residential Unit ─────────────────────────────────────────────────
//
// Vertical main riser at x=200 (INCOMING at bottom, flows upward).
//
// 2nd Storey (y=600): Master Bath (500) · Bath 2 (800) · Bath 3 (1100)
// 1st Storey (y=1400): Dry Kitchen (550) · Wet Kitchen (850) · Toilet (1100) · Bath 1 (1400)
//
// Each fixture area has a vertical sub-column hanging downward from the floor
// tee, with individual gate valve + fixture sub-branches going LEFT —
// matching the parallel-outlet layout shown in the PDF schematic.
// X positions are staggered between floors so columns don't visually collide.

function generateResidentialUnit(): { elements: CanvasElement[]; pipes: PipeElement[] } {
  const elements: CanvasElement[] = [];
  const pipes:    PipeElement[]   = [];

  const RX  = 200;   // riser X
  const F1Y = 1400;  // 1st storey tee Y
  const F2Y = 600;   // 2nd storey tee Y

  // ── Main vertical riser (rot=270 → upstream=bottom, downstream=top) ───────

  const meter  = el('water_meter', 'Water Meter', RX, 1800, 270);
  const gvMain = el('gate_valve',  'Gate Valve',  RX, 1650, 270);
  const tee1st = el('tee_junction','Tee Junction', RX,  F1Y, 270);
  const tee2nd = el('tee_junction','Tee Junction', RX,  F2Y, 270);
  const gvTop  = el('gate_valve',  'Gate Valve',  RX,  350, 270);
  elements.push(meter, gvMain, tee1st, tee2nd, gvTop);

  pipes.push(p(RX, 2000, RX, 1824));                                              // INCOMING stub
  pipes.push(p(...iDn(RX, 1800, 270), ...iUp(RX, 1650, 270)));                   // meter → gvMain
  pipes.push(p(...iDn(RX, 1650, 270), ...iUp(RX,  F1Y, 270)));                   // gvMain → 1st floor tee
  pipes.push(p(...iDn(RX,  F1Y, 270), ...iUp(RX,  F2Y, 270)));                   // 1st → 2nd floor tee
  pipes.push(p(...iDn(RX,  F2Y, 270), ...iUp(RX,  350, 270)));                   // 2nd floor tee → top cap

  // ── 1st Storey horizontal branch (y=F1Y, flowing right) ──────────────────
  // DK=550  WK=850  Toilet=1100  Bath1=1400

  const t1dk     = el('tee_junction', 'Tee Junction',  550, F1Y, 0);
  const t1wk     = el('tee_junction', 'Tee Junction',  850, F1Y, 0);
  const t1toilet = el('tee_junction', 'Tee Junction', 1100, F1Y, 0);
  const t1bath1  = el('tee_junction', 'Tee Junction', 1400, F1Y, 0);
  const gv1end   = el('gate_valve',   'Gate Valve',   1540, F1Y, 0);
  elements.push(t1dk, t1wk, t1toilet, t1bath1, gv1end);

  pipes.push(p(...tBranch(RX, F1Y, 270), ...iUp( 550, F1Y, 0)));
  pipes.push(p(...iDn( 550, F1Y, 0),     ...iUp( 850, F1Y, 0)));
  pipes.push(p(...iDn( 850, F1Y, 0),     ...iUp(1100, F1Y, 0)));
  pipes.push(p(...iDn(1100, F1Y, 0),     ...iUp(1400, F1Y, 0)));
  pipes.push(p(...iDn(1400, F1Y, 0),     ...iUp(1540, F1Y, 0)));

  // ── 2nd Storey horizontal branch (y=F2Y, flowing right) ──────────────────
  // Master Bath=500  Bath2=800  Bath3=1100

  const t2mb    = el('tee_junction', 'Tee Junction',  500, F2Y, 0);
  const t2bath2 = el('tee_junction', 'Tee Junction',  800, F2Y, 0);
  const t2bath3 = el('tee_junction', 'Tee Junction', 1100, F2Y, 0);
  const gv2end  = el('gate_valve',   'Gate Valve',   1240, F2Y, 0);
  elements.push(t2mb, t2bath2, t2bath3, gv2end);

  pipes.push(p(...tBranch(RX, F2Y, 270), ...iUp( 500, F2Y, 0)));
  pipes.push(p(...iDn( 500, F2Y, 0),     ...iUp( 800, F2Y, 0)));
  pipes.push(p(...iDn( 800, F2Y, 0),     ...iUp(1100, F2Y, 0)));
  pipes.push(p(...iDn(1100, F2Y, 0),     ...iUp(1240, F2Y, 0)));

  // ── Fixture sub-columns (hanging downward from each floor tee) ───────────

  const f1Start = F1Y + 24;   // 1424
  const f2Start = F2Y + 24;   // 624

  const dryKit = makeDryKitchen( 550, f1Start);
  const wetKit = makeWetKitchen( 850, f1Start);
  const toilet = makeToilet(    1100, f1Start);
  const bath1  = makeBath1(     1400, f1Start);

  const master = makeMasterBath(  500, f2Start);
  const bath2  = makeStandardBath(800, f2Start);
  const bath3  = makeStandardBath(1100, f2Start);

  for (const branch of [dryKit, wetKit, toilet, bath1, master, bath2, bath3]) {
    elements.push(...branch.elements);
    pipes.push(...branch.pipes);
  }

  return { elements, pipes };
}

// ── Exported template registry ────────────────────────────────────────────────

export const TEMPLATES: Template[] = [
  {
    id: 'standard-residential-unit',
    name: 'Standard Residential Unit',
    description:
      'Full schematic for a typical residential unit: Master Bath, Bath 1–3, ' +
      'Wet Kitchen, Dry Kitchen, and Toilet. Vertical main riser with 1st and 2nd storey ' +
      'branches. Each area shows individual outlets (WC, WB, WM, SH+, LB, TAP etc.) with ' +
      'isolation gate valves and water heaters. Fill in pipe sizes, materials, and MRL values after loading.',
    generate: generateResidentialUnit,
  },
];
