import { PipeElement } from '../types';
import { segmentIntersection } from './geometry';

// Schematic units (see SCHEMATIC_SYMBOL_PX = 6 in types/index.ts) — kept small
// relative to a symbol's own footprint so a jump reads as a deliberate drafting
// mark, not an oversized detour.
export const PIPE_JUMP_RADIUS_PX = 1.2;

// A crossing within this many px of either segment's own endpoint is treated as
// a real connection/joint (e.g. a tee/elbow), not a jump-worthy crossing.
const ENDPOINT_MARGIN_PX = 0.5;

// Visible-ink arc approximation — deliberately more segments than SymbolNode.tsx's
// 6-step elbow hit-path arc (which only needs to be "close enough" for invisible
// hit-testing tolerance); this one is drawn on screen and in the PDF, so faceting
// would actually be visible at typical zoom.
const ARC_STEPS = 14;

export interface PipeJump { t: number; x: number; y: number }

/** Fraction of a segment's own length, from either end, that counts as "the
 *  endpoint" rather than its interior — clamped so a very short pipe's margin
 *  can't swallow its entire length. */
function endpointFraction(segLength: number): number {
  return Math.min(0.25, ENDPOINT_MARGIN_PX / Math.max(segLength, 1e-6));
}

function isInterior(t: number, segLength: number): boolean {
  const eps = endpointFraction(segLength);
  return t > eps && t < 1 - eps;
}

/** True if pipe `a` stays straight (wins) over pipe `b` at a crossing between them. */
function winsOver(a: PipeElement, b: PipeElement): boolean {
  const aSolid = a.pipeType !== 'hot';
  const bSolid = b.pipeType !== 'hot';
  if (aSolid !== bSolid) return aSolid;

  const aLen = Math.hypot(a.endX - a.startX, a.endY - a.startY) || 1;
  const bLen = Math.hypot(b.endX - b.startX, b.endY - b.startY) || 1;
  const aVertical = Math.abs(a.endY - a.startY) / aLen;
  const bVertical = Math.abs(b.endY - b.startY) / bLen;
  if (Math.abs(aVertical - bVertical) > 1e-9) return aVertical > bVertical;

  // Final tiebreak: stable geometry, not array position. A pipe's index in the store's
  // pipes array is NOT stable across edits — canvasStore.ts's insertElementOnPipe,
  // insertElementOnPipeInline, and applyDcvAssemblies all replace a split pipe with new
  // fragments appended at the array's END, so splitting pipe A elsewhere in the drawing
  // could silently move it past pipe B in array order and flip an existing A-vs-B tie
  // that neither pipe was actually involved in editing. Comparing coordinates (falling
  // back to id only in the near-impossible case of two pipes sharing all 4 coordinates)
  // is fully independent of array/creation order.
  if (a.startX !== b.startX) return a.startX < b.startX;
  if (a.startY !== b.startY) return a.startY < b.startY;
  if (a.endX !== b.endX) return a.endX < b.endX;
  if (a.endY !== b.endY) return a.endY < b.endY;
  return a.id < b.id;
}

/**
 * For every pipe, the sorted (by fractional position `t` along it) list of points
 * where it should detour with a jump arc, because a higher-priority pipe crosses
 * it there without connecting. Pipes with no jumps are absent from the map.
 *
 * Priority at a crossing: a solid pipe (pipeType !== 'hot') always wins over a
 * dashed one; a same-style tie goes to whichever pipe is closer to vertical
 * (generalizes the "verticals stay straight, runs duck under" convention to
 * diagonal generic pipes — see useCanvasInteraction.ts's applyConstraint, which
 * only axis-locks cold/hot pipes and Shift-held generic pipes, not plain
 * freehand generic ones); any remaining tie goes to whichever pipe's coordinates
 * sort first (see winsOver's tiebreak comment for why this must be geometry-based,
 * not array position).
 */
export function computePipeJumps(pipes: PipeElement[]): Map<string, PipeJump[]> {
  const raw = new Map<string, { t: number; x: number; y: number }[]>();

  for (let i = 0; i < pipes.length; i++) {
    for (let j = i + 1; j < pipes.length; j++) {
      const a = pipes[i], b = pipes[j];
      const hit = segmentIntersection(a.startX, a.startY, a.endX, a.endY, b.startX, b.startY, b.endX, b.endY);
      if (!hit) continue;

      const aLen = Math.hypot(a.endX - a.startX, a.endY - a.startY);
      const bLen = Math.hypot(b.endX - b.startX, b.endY - b.startY);
      if (!isInterior(hit.t, aLen) || !isInterior(hit.u, bLen)) continue;

      const loser = winsOver(a, b) ? b : a;
      const loserT = loser === a ? hit.t : hit.u;
      const loserLen = loser === a ? aLen : bLen;

      // Drop jumps too close to the losing pipe's own endpoint — an arc there
      // would clip into the arrowhead or the draggable-endpoint circle.
      if (loserT * loserLen < PIPE_JUMP_RADIUS_PX || (1 - loserT) * loserLen < PIPE_JUMP_RADIUS_PX) continue;

      const list = raw.get(loser.id) ?? [];
      list.push({ t: loserT, x: hit.x, y: hit.y });
      raw.set(loser.id, list);
    }
  }

  const result = new Map<string, PipeJump[]>();
  for (const [pipeId, jumps] of raw) {
    jumps.sort((p, q) => p.t - q.t);
    const merged: PipeJump[] = [];
    for (const jump of jumps) {
      const prev = merged[merged.length - 1];
      if (prev && Math.hypot(jump.x - prev.x, jump.y - prev.y) < 2 * PIPE_JUMP_RADIUS_PX) continue;
      merged.push(jump);
    }
    if (merged.length > 0) result.set(pipeId, merged);
  }
  return result;
}

export interface PipeRunSegment {
  points: { x: number; y: number }[]; // >= 2 points
  /** true = an arc bulge — always render without a dash, regardless of the pipe's own
   *  line style, since a dash pattern running continuously across an arc lands at a
   *  different phase on every crossing (depending purely on how far along the pipe it
   *  falls), making identically-sized arcs look inconsistent from one crossing to the
   *  next. false = a straight run — follows the pipe's own dash setting, if any. */
  isArcBulge: boolean;
}

/**
 * Straight-run + arc-bulge segments from (startX,startY) to (endX,endY), detouring
 * around each jump point. Returns exactly one straight segment [{start},{end}] when
 * jumps is empty — bit-for-bit the same 2-point line PipeElement.tsx has always
 * rendered for the common (no-crossing) case.
 */
export function buildJumpSegments(
  startX: number, startY: number, endX: number, endY: number,
  jumps: PipeJump[], bulgeRadius: number = PIPE_JUMP_RADIUS_PX,
): PipeRunSegment[] {
  if (jumps.length === 0) return [{ points: [{ x: startX, y: startY }, { x: endX, y: endY }], isArcBulge: false }];

  const dx = endX - startX, dy = endY - startY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len; // unit vector along the pipe
  const nx = -uy, ny = ux;            // unit normal (perpendicular), fixed side for a consistent-looking bulge

  const segments: PipeRunSegment[] = [];
  let runStart = { x: startX, y: startY };
  for (const jump of jumps) {
    const centerDist = Math.hypot(jump.x - startX, jump.y - startY);
    const approach = { x: startX + ux * (centerDist - bulgeRadius), y: startY + uy * (centerDist - bulgeRadius) };
    const depart = { x: startX + ux * (centerDist + bulgeRadius), y: startY + uy * (centerDist + bulgeRadius) };

    segments.push({ points: [runStart, approach], isArcBulge: false });

    // Semicircle centered on the jump point, bulging toward +normal, parametrized
    // directly from the approach point to the depart point around that center.
    const arcPoints: { x: number; y: number }[] = [approach];
    for (let i = 1; i < ARC_STEPS; i++) {
      const angle = Math.PI * (i / ARC_STEPS);
      const localX = -bulgeRadius * Math.cos(angle); // -r -> +r along the travel axis
      const localY = bulgeRadius * Math.sin(angle);  // 0 -> r -> 0 along the normal
      arcPoints.push({ x: jump.x + ux * localX + nx * localY, y: jump.y + uy * localX + ny * localY });
    }
    arcPoints.push(depart);
    segments.push({ points: arcPoints, isArcBulge: true });

    runStart = depart;
  }
  segments.push({ points: [runStart, { x: endX, y: endY }], isArcBulge: false });
  return segments;
}
