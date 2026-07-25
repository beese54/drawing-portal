import { useRef, useMemo } from 'react';
import { Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
import { useCanvasStore } from '../../store/canvasStore';
import { useUiStore } from '../../store/uiStore';
import { SYMBOL_PORTS, getElementPorts, getPortPosition, getScaledPortOffset, rotateOffset } from '../../utils/symbolPorts';
import { closestPointOnSegment } from '../../utils/geometry';
import { inferFluidAtPoint } from '../../utils/fluidInference';
import type { PipeType, PipeElement } from '../../types';
import { SCHEMATIC_SYMBOL_PX, isBackflowRiskElement, NEVER_MIRROR_IMAGE_SYMBOL_IDS } from '../../types';

const FLUID_MATCH = 5; // px — slightly above CANVAS_SNAP_THRESHOLD so drag-snapped connections are always detected

// RGB values matching the pipe colors in PipeElement.tsx
export const TINT_RGB: Record<string, [number, number, number]> = {
  cold: [0,   123, 255],  // #007bff
  hot:  [230,  51,  41],  // #e63329
};

/** Whether a symbol's image should be mirrored when its element has scaleX=-1 — false for
 *  symbols with baked-in text that would read backwards (see NEVER_MIRROR_IMAGE_SYMBOL_IDS).
 *  Single source of truth for both the Konva canvas and the PDF exporter. */
export function shouldMirrorSymbolImage(symbolId: string): boolean {
  return !NEVER_MIRROR_IMAGE_SYMBOL_IDS.has(symbolId);
}

const CANVAS_SNAP_THRESHOLD = 4; // px — snap when dragging symbol near another symbol's port
const ALIGN_GUIDE_THRESHOLD = 3; // px — show/snap an alignment guide when a port nears another port's x or y, even far apart on the other axis

// Half-width (local px) of the invisible click margin drawn around the actual
// ink for thin-glyph symbols (elbow_bend, tee_junction) — see
// THIN_GLYPH_HIT_BUILDERS below. Deliberately narrow: these symbols' visible
// stroke is thin (~0.3-0.4px at default symbol size) and sits inside a mostly
// -empty bounding box, so a generic full-box hit rect (see HIT_PADDING_PX in
// SymbolNode) swallows clicks meant for a pipe terminating in one of the
// box's empty corners — exactly where a connected pipe's endpoint has to be,
// by design (reported 2026-07-24: couldn't click a cold pipe running into an
// elbow bend). This margin only needs to comfortably cover the drawn line,
// not the whole box.
const THIN_GLYPH_HIT_HALF_WIDTH = 1;

/** Appends a filled quad ("thick line segment") to ctx's current path, as an
 *  approximation of a stroked line for hit-testing purposes only — not meant
 *  to be visually rendered. */
function addHitCapsule(ctx: Konva.Context, x1: number, y1: number, x2: number, y2: number, halfWidth: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * halfWidth;
  const ny = (dx / len) * halfWidth;
  ctx.moveTo(x1 + nx, y1 + ny);
  ctx.lineTo(x2 + nx, y2 + ny);
  ctx.lineTo(x2 - nx, y2 - ny);
  ctx.lineTo(x1 - nx, y1 - ny);
  ctx.closePath();
}

/** Elbow bend's actual ink (backend/symbols/default/elbow_bend.svg): a
 *  horizontal stub, a quarter-circle arc (centre (24,40) r=20, sweeping from
 *  -90deg to 0deg), and a vertical stub — inside a viewBox of (2,18)-(46,62)
 *  (44x44). The arc is approximated as short straight segments; fine for hit
 *  -testing, not for rendering. */
function buildElbowBendHitPath(ctx: Konva.Context, width: number, height: number) {
  const VB_X = 2, VB_Y = 18, VB_SIZE = 44;
  const map = (sx: number, sy: number) => ({
    x: ((sx - VB_X) / VB_SIZE) * width,
    y: ((sy - VB_Y) / VB_SIZE) * height,
  });
  const hw = THIN_GLYPH_HIT_HALF_WIDTH;

  const stubStart = map(4, 20);
  const arcStart = map(24, 20);
  addHitCapsule(ctx, stubStart.x, stubStart.y, arcStart.x, arcStart.y, hw);

  const cx = 24, cy = 40, r = 20;
  const ARC_STEPS = 6;
  let prev = arcStart;
  for (let i = 1; i <= ARC_STEPS; i++) {
    const angle = -Math.PI / 2 + (i / ARC_STEPS) * (Math.PI / 2);
    const p = map(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    addHitCapsule(ctx, prev.x, prev.y, p.x, p.y, hw);
    prev = p;
  }

  const stubEnd = map(44, 60);
  addHitCapsule(ctx, prev.x, prev.y, stubEnd.x, stubEnd.y, hw);
}

/** Tee junction's actual ink (backend/symbols/default/tee_junction.svg): a
 *  horizontal line straight through the box plus a vertical stub from centre
 *  to the bottom edge — inside a 64x64 viewBox. */
function buildTeeJunctionHitPath(ctx: Konva.Context, width: number, height: number) {
  const VB_SIZE = 64;
  const map = (sx: number, sy: number) => ({ x: (sx / VB_SIZE) * width, y: (sy / VB_SIZE) * height });
  const hw = THIN_GLYPH_HIT_HALF_WIDTH;

  const left = map(0, 32);
  const right = map(64, 32);
  addHitCapsule(ctx, left.x, left.y, right.x, right.y, hw);

  const center = map(32, 32);
  const bottom = map(32, 64);
  addHitCapsule(ctx, center.x, center.y, bottom.x, bottom.y, hw);
}

/** Maps SVG content-space coordinates to local hit-path coordinates, replicating the
 *  browser's default SVG viewBox scaling (preserveAspectRatio="xMidYMid meet": uniform
 *  scale-to-fit + centering) — needed for symbols whose viewBox aspect ratio doesn't
 *  match their square declared width/height (elbow_bend/tee_junction get away with a
 *  naive linear map because their viewBoxes happen to already be square; the symbols
 *  below are wider than tall, so without this their ink would land in the wrong place). */
function svgViewBoxMapper(
  vbMinX: number, vbMinY: number, vbW: number, vbH: number,
  declaredSize: number, width: number, height: number,
) {
  const scale = Math.min(declaredSize / vbW, declaredSize / vbH);
  const translateX = (declaredSize - vbW * scale) / 2 - vbMinX * scale;
  const translateY = (declaredSize - vbH * scale) / 2 - vbMinY * scale;
  const finalScale = width / declaredSize; // == height / declaredSize — these symbols always render square
  return (sx: number, sy: number) => ({
    x: (sx * scale + translateX) * finalScale,
    y: (sy * scale + translateY) * finalScale,
  });
}

/** Rotates (x,y) by `deg` degrees around (cx,cy) — SVG's rotate() is clockwise for
 *  positive angles in its y-down coordinate system, matching the standard rotation
 *  matrix applied directly (no sign flip needed). Only y_type_strainer's basket-line
 *  needs this (its one segment has an explicit SVG `transform="rotate(...)"`). */
function rotatePoint(x: number, y: number, cx: number, cy: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = x - cx, dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/** Flexible connection's actual ink (backend/symbols/default/flexible_connection.svg):
 *  a zigzag of 8 straight segments inside a 64x17.4 viewBox. */
function buildFlexibleConnectionHitPath(ctx: Konva.Context, width: number, height: number) {
  const map = svgViewBoxMapper(0, 23.7, 64, 17.4, 64, width, height);
  const hw = THIN_GLYPH_HIT_HALF_WIDTH;
  const segs: [number, number, number, number][] = [
    [0, 32, 20, 32],
    [20.30357, 25.69643, 20.21429, 39.08929],
    [20.21429, 39, 25.92857, 26.14286],
    [25.75, 26.05357, 31.01786, 39],
    [31.01786, 38.73214, 36.73214, 25.875],
    [36.55357, 25.69643, 41.82143, 38.64286],
    [42, 26, 41.91071, 38.64286],
    [42, 32, 64, 32],
  ];
  for (const [x1, y1, x2, y2] of segs) {
    const p1 = map(x1, y1), p2 = map(x2, y2);
    addHitCapsule(ctx, p1.x, p1.y, p2.x, p2.y, hw);
  }
}

/** Y-type strainer's actual ink (backend/symbols/default/y_type_strainer.svg):
 *  inlet/outlet stubs, a basket outline, and one rotated diagonal line — inside a
 *  64x38 viewBox. */
function buildYTypeStrainerHitPath(ctx: Konva.Context, width: number, height: number) {
  const map = svgViewBoxMapper(0, 13, 64, 38, 64, width, height);
  const hw = THIN_GLYPH_HIT_HALF_WIDTH;
  const segs: [number, number, number, number][] = [
    [16.27901, 24.13016, 16.37203, 39.47898],
    [16.27901, 31.94411, 46.7906, 31.85108],
    [47.06967, 24.31621, 47.16269, 39.66503],
    [23.0697, 44.13014, 26.04644, 48.68827],
    [0, 32, 16, 32],   // inlet stub
    [47, 32, 64, 32],  // outlet stub
  ];
  for (const [x1, y1, x2, y2] of segs) {
    const p1 = map(x1, y1), p2 = map(x2, y2);
    addHitCapsule(ctx, p1.x, p1.y, p2.x, p2.y, hw);
  }
  // The rotated basket-diagonal line: apply the SVG's own transform="rotate(-32.8191
  // 35.4883 39.2464)" in content space before mapping to local coords.
  const r1 = rotatePoint(21.95342, 39.29293, 35.4883, 39.2464, -32.8191);
  const r2 = rotatePoint(49.02315, 39.19991, 35.4883, 39.2464, -32.8191);
  const p1 = map(r1.x, r1.y), p2 = map(r2.x, r2.y);
  addHitCapsule(ctx, p1.x, p1.y, p2.x, p2.y, hw);
}

/** Puddle flange's actual ink (backend/symbols/default/puddle_flange.svg): pipe stubs,
 *  an OUTLINED flange-body rect (fill="none" in the SVG — its 4 edges, not a filled
 *  area), side walls, and two wing lines — inside a 64x28.6 viewBox. */
function buildPuddleFlangeHitPath(ctx: Konva.Context, width: number, height: number) {
  const map = svgViewBoxMapper(0, 18.3, 64, 28.6, 64, width, height);
  const hw = THIN_GLYPH_HIT_HALF_WIDTH;
  const segs: [number, number, number, number][] = [
    [0, 32, 15.8, 32],           // left stub
    [15.8, 20.54, 15.8, 44.94],  // left side wall
    [49.5, 20.44, 49.5, 44.84],  // right side wall
    [33.1, 20.34, 33.1, 28.14],  // upper wing
    [33.2, 36.54, 33.2, 44.14],  // lower wing
    [49.5, 32, 64, 32],          // right stub
    // Flange body's 4 outline edges (fill="none" in the SVG, so it's a stroked
    // rectangle, not a filled area).
    [15.8, 28.14, 49.5, 28.14],
    [49.5, 28.14, 49.5, 36.54],
    [49.5, 36.54, 15.8, 36.54],
    [15.8, 36.54, 15.8, 28.14],
  ];
  for (const [x1, y1, x2, y2] of segs) {
    const p1 = map(x1, y1), p2 = map(x2, y2);
    addHitCapsule(ctx, p1.x, p1.y, p2.x, p2.y, hw);
  }
}

/** Pipe blank-off's actual ink (backend/symbols/default/pipe_blank_off.svg): an inlet
 *  stub plus a double-line blank plate — inside a 50.6x26.0 viewBox (the one builder here
 *  where the viewBox isn't already the same aspect as the declared 64x64 box, so the
 *  general mapper's non-1 scale/translate actually matters, not just its translate). */
function buildPipeBlankOffHitPath(ctx: Konva.Context, width: number, height: number) {
  const map = svgViewBoxMapper(0, 18, 50.6, 26, 64, width, height);
  const hw = THIN_GLYPH_HIT_HALF_WIDTH;
  const segs: [number, number, number, number][] = [
    [0, 31, 43, 31],
    [43, 20, 43.9, 42],
    [48, 20, 48.65, 42],
  ];
  for (const [x1, y1, x2, y2] of segs) {
    const p1 = map(x1, y1), p2 = map(x2, y2);
    addHitCapsule(ctx, p1.x, p1.y, p2.x, p2.y, hw);
  }
}

/** Symbols whose visible ink occupies only a thin sliver of their bounding
 *  box — these get a hand-authored hit path tracing the actual glyph instead
 *  of the generic full-box rect (see HIT_PADDING_PX/hitFunc in SymbolNode). */
const THIN_GLYPH_HIT_BUILDERS: Record<string, (ctx: Konva.Context, width: number, height: number) => void> = {
  elbow_bend: buildElbowBendHitPath,
  tee_junction: buildTeeJunctionHitPath,
  flexible_connection: buildFlexibleConnectionHitPath,
  y_type_strainer: buildYTypeStrainerHitPath,
  puddle_flange: buildPuddleFlangeHitPath,
  pipe_blank_off: buildPipeBlankOffHitPath,
};

interface SymbolNodeProps {
  id: string;
  symbolId: string;
  imageUrl: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation: number;
  scaleX?: number;
  isSelected: boolean;
  draggable?: boolean;
  tintPipeType?: PipeType | null;
  /** Overrides TINT_RGB[tintPipeType] when set — lets a recolored pipe's customColor
   *  carry into an adjoining elbow/tee's tint instead of always showing the type default. */
  tintCustomColor?: string;
  onHoverEnter?: () => void;
  onHoverLeave?: () => void;
  onElementClick?: (id: string, symbolId: string) => void;
}

/** Parses a `#rrggbb` hex color into an [r,g,b] triple, or null if malformed. */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function SymbolNode({ id, symbolId, imageUrl, x, y, width = SCHEMATIC_SYMBOL_PX, height = SCHEMATIC_SYMBOL_PX, rotation, scaleX = 1, isSelected: _isSelected, draggable = true, tintPipeType, tintCustomColor, onHoverEnter, onHoverLeave, onElementClick }: SymbolNodeProps) {
  const [image] = useImage(imageUrl, 'anonymous');
  const nodeRef = useRef<Konva.Image>(null);

  // Tinted symbols (tee/elbow) need pixel-level colour manipulation so we
  // pre-rasterize to an offscreen canvas. Untinted symbols return the raw SVG
  // image so Konva re-renders from the vector at the correct display resolution.
  const tintedImage = useMemo<HTMLCanvasElement | HTMLImageElement | undefined>(() => {
    if (!image) return undefined;
    if (!tintPipeType) return image;
    const rgb = (tintCustomColor && hexToRgb(tintCustomColor)) || TINT_RGB[tintPipeType];
    const tw = Math.max(256, Math.round(width * 12));
    const th = Math.max(256, Math.round(height * 12));
    const offscreen = document.createElement('canvas');
    offscreen.width = tw;
    offscreen.height = th;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return image;
    try {
      ctx.drawImage(image, 0, 0, tw, th);
      const [r, g, b] = rgb;
      const imgData = ctx.getImageData(0, 0, tw, th);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 10) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
      }
      ctx.putImageData(imgData, 0, 0);
      return offscreen;
    } catch {
      return image;
    }
  }, [image, tintPipeType, tintCustomColor, width, height]);

  const moveElement = useCanvasStore((s) => s.moveElement);
  const updateCarriesFluid = useCanvasStore((s) => s.updateCarriesFluid);
  const setSelected = useCanvasStore((s) => s.setSelected);

  const halfW = width / 2;
  const halfH = height / 2;

  // Extra invisible click/drag margin beyond the symbol's own visible edge, per
  // side. Symbols render on top of pipes (ElementsLayer.tsx draws pipes first,
  // symbols second), so this hit rect always wins over a pipe underneath it —
  // too much padding here silently steals clicks from any pipe running close to
  // the symbol (reported 2026-07-16: a tee junction's hit area was swallowing an
  // adjacent pipe click at typical schematic density). Pipes already have their
  // own generous hitStrokeWidth (8px, see PipeElement.tsx) to stay clickable
  // despite their thin visual stroke, so this only needs to close the gap for
  // tiny (6px) symbols, not match a pipe's click width.
  const HIT_PADDING_PX = 2;

  return (
    <>
      <KonvaImage
        ref={nodeRef}
        image={tintedImage}
        x={x}
        y={y}
        width={width}
        height={height}
        offsetX={halfW}
        offsetY={halfH}
        rotation={rotation}
        scaleX={shouldMirrorSymbolImage(symbolId) ? scaleX : 1}
        draggable={draggable}
        hitFunc={(ctx, shape) => {
          // Local space origin (0,0) is the image top-left (because offsetX/offsetY shift it).
          ctx.beginPath();
          const thinGlyphBuilder = THIN_GLYPH_HIT_BUILDERS[symbolId];
          if (thinGlyphBuilder) {
            thinGlyphBuilder(ctx, width, height);
          } else {
            // Center the hit rect at (halfW, halfH) to align with the visible symbol.
            const hw = halfW + HIT_PADDING_PX;
            const hh = halfH + HIT_PADDING_PX;
            ctx.rect(halfW - hw, halfH - hh, hw * 2, hh * 2);
            ctx.closePath();
          }
          ctx.fillStrokeShape(shape);
        }}
        onClick={(e) => { if (e.evt.button === 0) setSelected(id); }}
        onDblClick={() => { setSelected(id); onElementClick?.(id, symbolId); }}
        onTap={() => { setSelected(id); }}
        onDblTap={() => { setSelected(id); onElementClick?.(id, symbolId); }}
        onDragMove={(e) => {
          const node = e.target as Konva.Node;
          const dragX = node.x();
          const dragY = node.y();
          const { elements, pipes } = useCanvasStore.getState();
          const thisEl = elements.find((el) => el.id === id);
          const myPorts = thisEl ? getElementPorts(thisEl) : (SYMBOL_PORTS[symbolId] ?? []);
          if (myPorts.length === 0) return;

          // 0. Hard-lock any port that already has a pipe connected to it onto
          // that pipe's existing H/V axis — otherwise freely dragging the
          // symbol stretches an already-straight pipe into a diagonal one
          // (the draw-time fix only stops *creating* a diagonal pipe, not
          // dragging one out of an existing straight connection). Mirrors how
          // dragging a pipe's own endpoint (PipeElement.tsx) is already
          // locked to one axis. Relocating a connected symbol off-axis means
          // deleting its pipe first, same as any other physical re-plumb.
          let lockedAnyAxis = false;
          for (let i = 0; i < myPorts.length; i++) {
            const connectedPipe = pipes.find(
              (p) =>
                (p.startElementId === id && p.startPortIndex === i) ||
                (p.endElementId === id && p.endPortIndex === i)
            );
            if (!connectedPipe) continue;
            const isStart = connectedPipe.startElementId === id && connectedPipe.startPortIndex === i;
            const fixedX = isStart ? connectedPipe.endX : connectedPipe.startX;
            const fixedY = isStart ? connectedPipe.endY : connectedPipe.startY;
            const pipeIsHorizontal =
              Math.abs(connectedPipe.startX - connectedPipe.endX) >= Math.abs(connectedPipe.startY - connectedPipe.endY);
            const { ox, oy } = getScaledPortOffset(symbolId, myPorts[i], width, height, scaleX);
            const rot = rotateOffset(ox, oy, rotation);
            if (pipeIsHorizontal) {
              node.y(fixedY - rot.y);
            } else {
              node.x(fixedX - rot.x);
            }
            lockedAnyAxis = true;
          }
          if (lockedAnyAxis) {
            useUiStore.getState().clearAlignmentGuide();
            return;
          }

          // For tee/elbow: snap via the user-chosen inlet port(s) only.
          // For all others: snap via any port.
          let portsToSnap = myPorts;
          if (symbolId === 'tee_junction' || symbolId === 'elbow_bend') {
            if (thisEl?.upstreamPortIndices !== undefined) {
              portsToSnap = thisEl.upstreamPortIndices.map((i) => myPorts[i]).filter(Boolean);
            } else if (thisEl?.upstreamPortIndex !== undefined) {
              const p = myPorts[thisEl.upstreamPortIndex];
              if (p) portsToSnap = [p];
            }
          }

          // 1. Snap inlet port to another symbol's port
          for (const myPort of portsToSnap) {
            const { ox, oy } = getScaledPortOffset(symbolId, myPort, width, height, scaleX);
            const rot = rotateOffset(ox, oy, rotation);
            const myPortX = dragX + rot.x;
            const myPortY = dragY + rot.y;
            for (const otherEl of elements) {
              if (otherEl.id === id) continue;
              const otherPorts = getElementPorts(otherEl);
              for (const otherPort of otherPorts) {
                const otherPos = getPortPosition(otherEl, otherPort);
                const d = Math.sqrt((myPortX - otherPos.x) ** 2 + (myPortY - otherPos.y) ** 2);
                if (d < CANVAS_SNAP_THRESHOLD) {
                  node.x(dragX + (otherPos.x - myPortX));
                  node.y(dragY + (otherPos.y - myPortY));
                  useUiStore.getState().clearAlignmentGuide();
                  return;
                }
              }
            }
          }

          // 1.5 Alignment guide: snap this symbol into axis-alignment with another
          // symbol's port on a shared x or y, even when far apart on the other axis,
          // so a straight pipe can later be drawn between them instead of a diagonal.
          {
            let bestGuide: { axis: 'x' | 'y'; matchValue: number; delta: number; dist: number } | null = null;
            for (const myPort of myPorts) {
              const { ox, oy } = getScaledPortOffset(symbolId, myPort, width, height, scaleX);
              const rot = rotateOffset(ox, oy, rotation);
              const myPortX = dragX + rot.x;
              const myPortY = dragY + rot.y;
              for (const otherEl of elements) {
                if (otherEl.id === id) continue;
                for (const otherPort of getElementPorts(otherEl)) {
                  const otherPos = getPortPosition(otherEl, otherPort);
                  const dx = otherPos.x - myPortX;
                  const dy = otherPos.y - myPortY;
                  if (Math.abs(dx) < ALIGN_GUIDE_THRESHOLD && (!bestGuide || Math.abs(dx) < bestGuide.dist)) {
                    bestGuide = { axis: 'x', matchValue: otherPos.x, delta: dx, dist: Math.abs(dx) };
                  }
                  if (Math.abs(dy) < ALIGN_GUIDE_THRESHOLD && (!bestGuide || Math.abs(dy) < bestGuide.dist)) {
                    bestGuide = { axis: 'y', matchValue: otherPos.y, delta: dy, dist: Math.abs(dy) };
                  }
                }
              }
            }
            if (bestGuide) {
              if (bestGuide.axis === 'x') node.x(dragX + bestGuide.delta);
              else node.y(dragY + bestGuide.delta);
              useUiStore.getState().setAlignmentGuide({ axis: bestGuide.axis, value: bestGuide.matchValue });
              return;
            }
            useUiStore.getState().clearAlignmentGuide();
          }

          // 2. Snap any port to nearest pipe body (all symbol types)
          {
            let bestDist = CANVAS_SNAP_THRESHOLD;
            let bestDx = 0;
            let bestDy = 0;
            let snapped = false;
            for (const myPort of portsToSnap) {
              const { ox, oy } = getScaledPortOffset(symbolId, myPort, width, height, scaleX);
              const rot = rotateOffset(ox, oy, rotation);
              const myPortX = dragX + rot.x;
              const myPortY = dragY + rot.y;
              for (const pipe of pipes) {
                const { x: sx, y: sy } = closestPointOnSegment(
                  myPortX, myPortY, pipe.startX, pipe.startY, pipe.endX, pipe.endY
                );
                const d = Math.sqrt((myPortX - sx) ** 2 + (myPortY - sy) ** 2);
                if (d < bestDist) {
                  bestDist = d;
                  bestDx = sx - myPortX;
                  bestDy = sy - myPortY;
                  snapped = true;
                }
              }
            }
            if (snapped) {
              node.x(dragX + bestDx);
              node.y(dragY + bestDy);
            }
          }
        }}
        onDragEnd={(e) => {
          useUiStore.getState().clearAlignmentGuide();
          const newX = e.target.x();
          const newY = e.target.y();
          const { elements: elsNow } = useCanvasStore.getState();
          const thisEl = elsNow.find((el) => el.id === id);
          const ports = thisEl ? getElementPorts(thisEl) : (SYMBOL_PORTS[symbolId] ?? []);
          moveElement(id, newX, newY);
          const { pipes, elements } = useCanvasStore.getState();
          const upstreamPort = ports.find((p) => p.role === 'upstream');
          if (!upstreamPort) return;
          const { ox, oy } = getScaledPortOffset(symbolId, upstreamPort, width, height, scaleX);
          const rot = rotateOffset(ox, oy, rotation);
          const portX = newX + rot.x;
          const portY = newY + rot.y;
          // Single pipe scan: find nearest connected pipe (shared by fluid inference and DCV check)
          let nearPipeId = '';
          let nearDist = FLUID_MATCH;
          for (const pipe of pipes) {
            const { x: sx, y: sy } = closestPointOnSegment(portX, portY, pipe.startX, pipe.startY, pipe.endX, pipe.endY);
            const d = Math.hypot(portX - sx, portY - sy);
            if (d < nearDist) { nearDist = d; nearPipeId = pipe.id; }
          }
          const nearPipe = nearPipeId ? pipes.find((p) => p.id === nearPipeId) ?? null : null;
          updateCarriesFluid(id, nearPipe ? inferFluidAtPoint([nearPipe], portX, portY, elements) : undefined);
          if (isBackflowRiskElement(thisEl ?? { symbolId }) && nearPipe) {
            const alreadyProtected = elements.some((el) => {
              if (el.symbolId !== 'check_valve' && el.symbolId !== 'gate_valve') return false;
              const cp = closestPointOnSegment(el.x, el.y, nearPipe.startX, nearPipe.startY, nearPipe.endX, nearPipe.endY);
              return Math.hypot(el.x - cp.x, el.y - cp.y) < FLUID_MATCH;
            });
            if (!alreadyProtected) {
              useUiStore.getState().showDcvToast(id, newX, newY, nearPipeId);
            }
          }
        }}
        onMouseEnter={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'move';
          onHoverEnter?.();
        }}
        onMouseLeave={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'default';
          onHoverLeave?.();
        }}
      />
    </>
  );
}
