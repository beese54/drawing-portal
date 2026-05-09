import { useRef, useMemo } from 'react';
import { Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
import { useCanvasStore } from '../../store/canvasStore';
import { SYMBOL_PORTS, getPortPosition, rotateOffset } from '../../utils/symbolPorts';
import { closestPointOnSegment } from '../../utils/geometry';
import type { PipeType, PipeElement } from '../../types';

const FLUID_MATCH = 20; // px — must match inferFluidFromPipe in DrawingCanvas

/** Same logic as inferFluidFromPipe in DrawingCanvas but runs inside SymbolNode. */
function inferFluidForElement(
  pipes: PipeElement[],
  upstreamPortX: number,
  upstreamPortY: number,
  allElements: import('../../types').CanvasElement[],
): 'cold' | 'hot' | undefined {
  for (const pipe of pipes) {
    const atStart = Math.hypot(pipe.startX - upstreamPortX, pipe.startY - upstreamPortY) < FLUID_MATCH;
    const atEnd   = Math.hypot(pipe.endX   - upstreamPortX, pipe.endY   - upstreamPortY) < FLUID_MATCH;
    if (!atStart && !atEnd) continue;
    if (pipe.pipeType === 'cold' || pipe.pipeType === 'hot') return pipe.pipeType;
    // Generic pipe — check for upstream element
    const otherX = atEnd ? pipe.startX : pipe.endX;
    const otherY = atEnd ? pipe.startY : pipe.endY;
    for (const el of allElements) {
      const ports = SYMBOL_PORTS[el.symbolId] ?? [];
      for (const port of ports) {
        if (port.role !== 'downstream') continue;
        const pos = getPortPosition(el, port);
        if (Math.hypot(pos.x - otherX, pos.y - otherY) < FLUID_MATCH) {
          return el.carriesFluid;
        }
      }
    }
  }
  return undefined;
}

// RGB values matching the pipe colors in PipeElement.tsx
const TINT_RGB: Record<string, [number, number, number]> = {
  cold: [0,   123, 255],  // #007bff
  hot:  [230,  51,  41],  // #e63329
};

const CANVAS_SNAP_THRESHOLD = 20; // px — snap when dragging symbol near another symbol's port

const SYMBOL_SIZE = 48;

interface SymbolNodeProps {
  id: string;
  symbolId: string;
  imageUrl: string;
  x: number;
  y: number;
  rotation: number;
  scaleX?: number;
  isSelected: boolean;
  draggable?: boolean;
  tintPipeType?: PipeType | null;
  onHoverEnter?: () => void;
  onHoverLeave?: () => void;
  onElementClick?: (id: string, symbolId: string) => void;
}

export function SymbolNode({ id, symbolId, imageUrl, x, y, rotation, scaleX = 1, isSelected, draggable = true, tintPipeType, onHoverEnter, onHoverLeave, onElementClick }: SymbolNodeProps) {
  const [image] = useImage(imageUrl, 'anonymous');
  const nodeRef = useRef<Konva.Image>(null);

  // Pre-process tint on an offscreen canvas — more reliable than Konva filter/cache.
  // Always specify explicit draw dimensions so SVGs (which report width=0) still render.
  const tintedImage = useMemo<HTMLCanvasElement | HTMLImageElement | undefined>(() => {
    if (!image) return undefined;
    const rgb = tintPipeType ? TINT_RGB[tintPipeType] : undefined;
    if (!rgb) return image;
    const [r, g, b] = rgb;
    const size = SYMBOL_SIZE;
    const offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return image;
    try {
      ctx.drawImage(image, 0, 0, size, size); // explicit size forces SVG to render
      const imgData = ctx.getImageData(0, 0, size, size);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 10) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
      }
      ctx.putImageData(imgData, 0, 0);
      return offscreen;
    } catch {
      // CORS taint or other canvas security error — fall back to original image
      return image;
    }
  }, [image, tintPipeType]);

  const moveElement = useCanvasStore((s) => s.moveElement);
  const updateCarriesFluid = useCanvasStore((s) => s.updateCarriesFluid);
  const setSelected = useCanvasStore((s) => s.setSelected);

  const half = SYMBOL_SIZE / 2;

  return (
    <>
      <KonvaImage
        ref={nodeRef}
        image={tintedImage}
        x={x}
        y={y}
        width={SYMBOL_SIZE}
        height={SYMBOL_SIZE}
        offsetX={half}
        offsetY={half}
        rotation={rotation}
        scaleX={scaleX}
        draggable={draggable}
        onClick={() => { setSelected(id); }}
        onDblClick={() => { setSelected(id); onElementClick?.(id, symbolId); }}
        onTap={() => { setSelected(id); }}
        onDblTap={() => { setSelected(id); onElementClick?.(id, symbolId); }}
        onDragMove={(e) => {
          const node = e.target as Konva.Node;
          const dragX = node.x();
          const dragY = node.y();
          const myPorts = SYMBOL_PORTS[symbolId] ?? [];
          if (myPorts.length === 0) return;
          const { elements, pipes } = useCanvasStore.getState();

          // For tee/elbow: snap via the user-chosen inlet port(s) only.
          // For all others: snap via any port.
          let portsToSnap = myPorts;
          if (symbolId === 'tee_junction' || symbolId === 'elbow_bend') {
            const thisEl = elements.find((el) => el.id === id);
            if (thisEl?.upstreamPortIndices !== undefined) {
              portsToSnap = thisEl.upstreamPortIndices.map((i) => myPorts[i]).filter(Boolean);
            } else if (thisEl?.upstreamPortIndex !== undefined) {
              const p = myPorts[thisEl.upstreamPortIndex];
              if (p) portsToSnap = [p];
            }
          }

          // 1. Snap inlet port to another symbol's port
          for (const myPort of portsToSnap) {
            const rot = rotateOffset(myPort.offsetX * scaleX, myPort.offsetY, rotation);
            const myPortX = dragX + rot.x;
            const myPortY = dragY + rot.y;
            for (const otherEl of elements) {
              if (otherEl.id === id) continue;
              const otherPorts = SYMBOL_PORTS[otherEl.symbolId] ?? [];
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
              const rot = rotateOffset(myPort.offsetX * scaleX, myPort.offsetY, rotation);
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
          const ports = SYMBOL_PORTS[symbolId] ?? [];
          const oldPorts = ports.map((port) => {
            const rot = rotateOffset(port.offsetX * scaleX, port.offsetY, rotation);
            return { x: x + rot.x, y: y + rot.y };
          });
          const newPorts = ports.map((port) => {
            const rot = rotateOffset(port.offsetX * scaleX, port.offsetY, rotation);
            return { x: newX + rot.x, y: newY + rot.y };
          });
          moveElement(id, newX, newY, oldPorts, newPorts);
          // Re-infer carriesFluid based on new position (upstream port → nearby pipe)
          const { pipes, elements } = useCanvasStore.getState();
          const upstreamPort = ports.find((p) => p.role === 'upstream');
          if (upstreamPort) {
            const rot = rotateOffset(upstreamPort.offsetX * scaleX, upstreamPort.offsetY, rotation);
            const fluid = inferFluidForElement(pipes, newX + rot.x, newY + rot.y, elements);
            updateCarriesFluid(id, fluid);
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
