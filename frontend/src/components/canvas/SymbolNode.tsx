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

/** Symbols whose visible ink occupies only a thin sliver of their bounding
 *  box — these get a hand-authored hit path tracing the actual glyph instead
 *  of the generic full-box rect (see HIT_PADDING_PX/hitFunc in SymbolNode). */
const THIN_GLYPH_HIT_BUILDERS: Record<string, (ctx: Konva.Context, width: number, height: number) => void> = {
  elbow_bend: buildElbowBendHitPath,
  tee_junction: buildTeeJunctionHitPath,
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
  onHoverEnter?: () => void;
  onHoverLeave?: () => void;
  onElementClick?: (id: string, symbolId: string) => void;
}

export function SymbolNode({ id, symbolId, imageUrl, x, y, width = SCHEMATIC_SYMBOL_PX, height = SCHEMATIC_SYMBOL_PX, rotation, scaleX = 1, isSelected: _isSelected, draggable = true, tintPipeType, onHoverEnter, onHoverLeave, onElementClick }: SymbolNodeProps) {
  const [image] = useImage(imageUrl, 'anonymous');
  const nodeRef = useRef<Konva.Image>(null);

  // Tinted symbols (tee/elbow) need pixel-level colour manipulation so we
  // pre-rasterize to an offscreen canvas. Untinted symbols return the raw SVG
  // image so Konva re-renders from the vector at the correct display resolution.
  const tintedImage = useMemo<HTMLCanvasElement | HTMLImageElement | undefined>(() => {
    if (!image) return undefined;
    if (!tintPipeType) return image;
    const rgb = TINT_RGB[tintPipeType];
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
  }, [image, tintPipeType, width, height]);

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
  // own generous hitStrokeWidth (4px, see PipeElement.tsx) to stay clickable
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
