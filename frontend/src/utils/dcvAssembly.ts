import { SYMBOL_PORTS, getElementPorts, getPortPosition, rotateOffset } from './symbolPorts';
import { isBranchProtected } from './backflowProtection';
import { SCHEMATIC_SYMBOL_PX, getBackflowRule } from '../types';
import type { CanvasElement, PipeElement } from '../types';

const STEP = SCHEMATIC_SYMBOL_PX;
const PIPE_MATCH_RADIUS = 30;

export interface AssemblyResult {
  /** Ordered nearest-the-fixture first (i.e. most downstream first). */
  elements: CanvasElement[];
  targetPipeId: string | null;
  /** Inlet position of the outermost (most upstream) element — used to truncate the target pipe. */
  snapX: number;
  snapY: number;
}

interface AssemblyComponent {
  symbolId: string;
  symbolName: string;
}

// SS636 §6.4 — double check valve, ordered nearest-fixture (downstream) first.
const DOUBLE_CHECK_VALVE_COMPONENTS: AssemblyComponent[] = [
  { symbolId: 'check_valve', symbolName: 'Check Valve' },
  { symbolId: 'check_valve', symbolName: 'Check Valve' },
  { symbolId: 'gate_valve',  symbolName: 'Gate Valve' },
];

// SS636 §6.5 — gate valve + check valve + vacuum breaker, ordered nearest-fixture (downstream) first.
const VB_AND_CHECK_VALVE_COMPONENTS: AssemblyComponent[] = [
  { symbolId: 'vacuum_breaker', symbolName: 'Vacuum Breaker' },
  { symbolId: 'check_valve',    symbolName: 'Check Valve' },
  { symbolId: 'gate_valve',     symbolName: 'Gate Valve' },
];

/**
 * Finds the rotation (0/90/180/270) that makes this symbol's own native
 * upstream→downstream direction match the desired cardinal flow direction (ux, uy).
 * Components don't all share the same "unrotated" axis — e.g. check_valve/gate_valve
 * default to horizontal (upstream/downstream both at offsetY 0), but vacuum_breaker
 * defaults to VERTICAL (offsetX 0) — so a single shared rotation for the whole
 * assembly is wrong for any component whose native axis differs from the others.
 */
function rotationForFlowDirection(symbolId: string, ux: number, uy: number): number {
  const ports = SYMBOL_PORTS[symbolId] ?? [];
  const upstream = ports.find((p) => p.role === 'upstream');
  const downstream = ports.find((p) => p.role === 'downstream');
  if (!upstream || !downstream) return uy !== 0 ? (uy > 0 ? 90 : 270) : (ux > 0 ? 0 : 180);

  const nativeDx = downstream.offsetX - upstream.offsetX;
  const nativeDy = downstream.offsetY - upstream.offsetY;
  for (const rot of [0, 90, 180, 270]) {
    const { x: rx, y: ry } = rotateOffset(nativeDx, nativeDy, rot);
    const len = Math.hypot(rx, ry);
    if (len === 0) continue;
    if (rx / len === ux && ry / len === uy) return rot;
  }
  return 0;
}

/**
 * Builds a backflow-protection assembly upstream of a single port position.
 * Orientation is inferred from the connected pipe's direction when one is found
 * nearby; otherwise falls back to the direction from that port to the fitting's
 * own centre (e.g. a horizontally-drawn water heater gets a horizontal assembly,
 * not an assumed-vertical one), snapped to a cardinal axis either way.
 */
function buildAssemblyAtPort(
  existing: CanvasElement,
  anchor: { x: number; y: number },
  pipes: PipeElement[],
  hintedPipeId: string,
  components: AssemblyComponent[],
): AssemblyResult {
  // Prefer the caller-hinted pipe if it actually ends near THIS port; otherwise
  // find whichever pipe ends closest to it. Each upstream port (e.g. Hot vs Cold
  // on a dual-supply fitting) is checked independently, since they're normally
  // fed by two different pipes.
  let targetPipe = pipes.find((p) => p.id === hintedPipeId);
  if (targetPipe && Math.hypot(targetPipe.endX - anchor.x, targetPipe.endY - anchor.y) > PIPE_MATCH_RADIUS) {
    targetPipe = undefined;
  }
  if (!targetPipe) {
    let closest = PIPE_MATCH_RADIUS;
    for (const p of pipes) {
      const dEnd = Math.hypot(p.endX - anchor.x, p.endY - anchor.y);
      if (dEnd < closest) { closest = dEnd; targetPipe = p; }
    }
  }

  // Assembly components are always standard size regardless of the fitting's size multiplier.
  const cvWidth  = SCHEMATIC_SYMBOL_PX;
  const cvHeight = SCHEMATIC_SYMBOL_PX;
  const cvFluid  = existing.carriesFluid;
  const cvHalfPort = SCHEMATIC_SYMBOL_PX / 2; // = 3 (scaled port offset for standard elements)

  // Flow direction, snapped to a cardinal axis (points from upstream source toward
  // the fitting). Dual-supply ports (e.g. Cold at offsetX -16) sit off-centre both
  // horizontally AND vertically from the fitting, so the raw centre-to-port vector
  // is diagonal — snapping avoids placing the assembly along that diagonal, which
  // both looks wrong and doesn't match a rotation that's only ever axis-aligned.
  let dx: number; let dy: number;
  if (targetPipe) {
    dx = targetPipe.endX - targetPipe.startX;
    dy = targetPipe.endY - targetPipe.startY;
  } else {
    dx = existing.x - anchor.x;
    dy = existing.y - anchor.y;
  }
  // ux/uy: unit vector along whichever axis dominates, sign preserved (last-resort
  // default: vertical, downward flow, matching the original fallback behaviour).
  let ux = 0; let uy = 1;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx !== 0) { ux = Math.sign(dx); uy = 0; }
  } else if (dy !== 0) {
    uy = Math.sign(dy); ux = 0;
  }

  // Place components upstream of anchor, nearest-fixture first.
  // Component[0].downstream touches anchor; each subsequent component's downstream
  // touches the previous component's upstream. Adjacent same-size elements are
  // STEP (=6) apart center-to-center; each element's own downstream port is
  // cvHalfPort (=3) from its center toward the fitting. Each component's rotation
  // is computed individually (not shared) since components can have different
  // native port axes (e.g. vacuum_breaker defaults to vertical, unlike check/gate valve).
  const elements = components.map((comp, i): CanvasElement => {
    const distFromAnchor = cvHalfPort + STEP * i;
    return {
      id: crypto.randomUUID(),
      symbolId: comp.symbolId,
      symbolName: comp.symbolName,
      x: anchor.x - ux * distFromAnchor,
      y: anchor.y - uy * distFromAnchor,
      rotation: rotationForFlowDirection(comp.symbolId, ux, uy),
      width: cvWidth,
      height: cvHeight,
      ...(cvFluid !== undefined && { carriesFluid: cvFluid }),
    };
  });

  const outer = elements[elements.length - 1];
  const outerPorts = SYMBOL_PORTS[outer.symbolId] ?? [];
  const outerUpstream = outerPorts.find((p) => p.role === 'upstream');
  const outerInletPos = outerUpstream ? getPortPosition(outer, outerUpstream) : { x: outer.x, y: outer.y };

  return {
    elements,
    targetPipeId: targetPipe?.id ?? null,
    snapX: outerInletPos.x,
    snapY: outerInletPos.y,
  };
}

/**
 * Builds one backflow-protection assembly per upstream port on the element,
 * skipping any port whose branch is already adequately protected. Most fittings
 * have a single upstream port (one assembly). Dual-supply fittings (e.g. a washing
 * machine with Hot + Cold enabled) have two upstream ports — each supply line needs
 * its own independent assembly, since protecting only one side would leave the
 * other unprotected — but if one side is already protected, re-inserting a redundant
 * assembly on top of it would be wrong. Uses getElementPorts() (not the raw
 * SYMBOL_PORTS registry) so it correctly resolves to the Hot/Cold port positions
 * when dual supply is active, instead of the single default port that doesn't
 * actually exist on that instance.
 *
 * Component set follows the element's backflow rule automatically:
 *   double_check_valve  — Gate Valve + 2 Check Valves   (SS636 §6.4)
 *   vb_and_check_valve  — Vacuum Breaker + Check Valve   (SS636 §6.5)
 */
export function buildBackflowAssemblies(
  elementId: string,
  pipeId: string,
  elements: CanvasElement[],
  pipes: PipeElement[],
): AssemblyResult[] {
  const existing = elements.find((e) => e.id === elementId);
  if (!existing) return [];

  const rule = getBackflowRule(existing);
  if (!rule) return [];
  const components = rule === 'double_check_valve' ? DOUBLE_CHECK_VALVE_COMPONENTS : VB_AND_CHECK_VALVE_COMPONENTS;

  const upstreamPorts = getElementPorts(existing).filter((p) => p.role === 'upstream');
  if (upstreamPorts.length === 0) return [];

  const results: AssemblyResult[] = [];
  for (const port of upstreamPorts) {
    const anchor = getPortPosition(existing, port);
    if (isBranchProtected(existing, anchor, elements, pipes)) continue;
    results.push(buildAssemblyAtPort(existing, anchor, pipes, pipeId, components));
  }
  return results;
}
