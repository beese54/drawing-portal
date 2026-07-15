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
import { SCHEMATIC_SYMBOL_PX, isBackflowRiskElement } from '../../types';

const FLUID_MATCH = 5; // px — slightly above CANVAS_SNAP_THRESHOLD so drag-snapped connections are always detected

// RGB values matching the pipe colors in PipeElement.tsx
const TINT_RGB: Record<string, [number, number, number]> = {
  cold: [0,   123, 255],  // #007bff
  hot:  [230,  51,  41],  // #e63329
};

const CANVAS_SNAP_THRESHOLD = 4; // px — snap when dragging symbol near another symbol's port

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

  // Invisible hit area is at least 14px so tiny symbols remain clickable/draggable
  const MIN_HIT_PX = 14;

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
        scaleX={scaleX}
        draggable={draggable}
        hitFunc={(ctx, shape) => {
          // Local space origin (0,0) is the image top-left (because offsetX/offsetY shift it).
          // Center the hit rect at (halfW, halfH) to align with the visible symbol.
          const hw = Math.max(halfW, MIN_HIT_PX / 2);
          const hh = Math.max(halfH, MIN_HIT_PX / 2);
          ctx.beginPath();
          ctx.rect(halfW - hw, halfH - hh, hw * 2, hh * 2);
          ctx.closePath();
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
                  return;
                }
              }
            }
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
