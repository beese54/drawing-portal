import React, { useState, useRef, useMemo, useCallback } from 'react';
import { Layer, Circle, Text, Rect, Group } from 'react-konva';
import Konva from 'konva';
import { useCanvasStore } from '../../store/canvasStore';
import { SymbolNode } from './SymbolNode';
import { PipeElement } from './PipeElement';
import { symbolsApi } from '../../api/client';
import { SYMBOL_PORTS, getPortPosition, rotateOffset, getEffectivePortRole, getEffectivePortLabel } from '../../utils/symbolPorts';
import { WATER_FITTING_TYPES } from '../../types';
import type { CanvasElement, PipeElement as PipeElementType, PipeType } from '../../types';
import { computePortConnectionStatus } from '../../utils/portConnectionStatus';

// Symbols that should be tinted to match their upstream pipe colour
const TINT_SYMBOL_IDS = new Set(['tee_junction', 'elbow_bend']);

const TINT_MATCH = 20; // px

/** BFS backwards through the pipe/element network from a canvas position.
 *  Returns 'cold'|'hot' if a typed pipe is reachable, null otherwise.
 *  Handles both pipe-connected and directly port-to-port snapped elements. */
function traceFluidFromPos(
  startX: number,
  startY: number,
  originId: string,
  elements: CanvasElement[],
  pipes: PipeElementType[],
): PipeType | null {
  const visited = new Set<string>();
  const queue: { x: number; y: number }[] = [{ x: startX, y: startY }];

  const visitElementAt = (ex: number, ey: number): PipeType | 'enqueued' | null => {
    for (const upEl of elements) {
      if (upEl.id === originId) continue;
      for (const upP of SYMBOL_PORTS[upEl.symbolId] ?? []) {
        const upPos = getPortPosition(upEl, upP);
        if (Math.hypot(upPos.x - ex, upPos.y - ey) < TINT_MATCH) {
          if (upEl.carriesFluid) return upEl.carriesFluid;
          for (const p2 of SYMBOL_PORTS[upEl.symbolId] ?? []) {
            queue.push(getPortPosition(upEl, p2));
          }
          return 'enqueued';
        }
      }
    }
    return null;
  };

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    const key = `${Math.round(x)},${Math.round(y)}`;
    if (visited.has(key)) continue;
    visited.add(key);

    // Direct port-to-port snap (no pipe between elements): check elements first
    const directResult = visitElementAt(x, y);
    if (directResult && directResult !== 'enqueued') return directResult;

    // Pipe traversal
    for (const pipe of pipes) {
      const atStart = Math.hypot(pipe.startX - x, pipe.startY - y) < TINT_MATCH;
      const atEnd   = Math.hypot(pipe.endX   - x, pipe.endY   - y) < TINT_MATCH;
      if (!atStart && !atEnd) continue;

      if (pipe.pipeType === 'cold' || pipe.pipeType === 'hot') return pipe.pipeType;

      // Generic pipe — step to the other end and continue BFS from there
      const otherX = atEnd ? pipe.startX : pipe.endX;
      const otherY = atEnd ? pipe.startY : pipe.endY;
      queue.push({ x: otherX, y: otherY });

      const pipeEndResult = visitElementAt(otherX, otherY);
      if (pipeEndResult && pipeEndResult !== 'enqueued') return pipeEndResult;
    }
  }
  return null;
}

/** Returns the fluid type (cold/hot) for a tee/elbow by checking stored property first,
 *  then falling back to a BFS traversal backwards through the pipe network. */
function getElbowTeeTint(
  el: CanvasElement,
  elements: CanvasElement[],
  pipes: PipeElementType[],
): PipeType | null {
  if (el.carriesFluid) return el.carriesFluid;

  const ports = SYMBOL_PORTS[el.symbolId] ?? [];
  let idx = 0;
  if (el.upstreamPortIndices?.length) {
    idx = el.upstreamPortIndices[0];
  } else if (el.upstreamPortIndex !== undefined) {
    idx = el.upstreamPortIndex;
  } else {
    const f = ports.findIndex((p) => p.role === 'upstream');
    if (f >= 0) idx = f;
  }
  const upPort = ports[idx];
  if (!upPort) return null;

  const portPos = getPortPosition(el, upPort);
  return traceFluidFromPos(portPos.x, portPos.y, el.id, elements, pipes);
}

interface DragPreview {
  symbolId: string;
  x: number;
  y: number;
}

interface RubberBandRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ElementsLayerProps {
  dragPreview?: DragPreview | null;
  onElementClick?: (id: string, symbolId: string) => void;
  rubberBand?: RubberBandRect | null;
}

/**
 * Returns (dx, dy) offset for a port label so it sits OUTSIDE the symbol bounds.
 * relX/relY = port position relative to the symbol centre.
 */
function portLabelOffset(relX: number, relY: number): { dx: number; dy: number } {
  if (Math.abs(relX) >= Math.abs(relY)) {
    // Horizontal port — place label left or right of the dot
    return relX < 0
      ? { dx: -42, dy: -5 }  // left port → label to the left  ("Input" is ~30px wide)
      : { dx:   8, dy: -5 }; // right port → label to the right
  }
  // Vertical port — place label above or below the dot
  return relY < 0
    ? { dx: -10, dy: -16 }   // top port → label above
    : { dx: -10, dy:   8 };  // bottom port → label below
}

/** Renders the water_fittings text label for an element (or null). */
function WaterFittingsLabel({ el }: { el: CanvasElement }) {
  if (el.symbolId !== 'water_fittings') return null;
  const fitting = WATER_FITTING_TYPES.find((t) => t.id === (el.fittingType ?? 'shower_tap'));
  const code = fitting?.code ?? 'ST';
  const ticks = el.efficiencyRating ? '✓'.repeat(el.efficiencyRating) : '';
  const label = el.efficiencyRating ? `${code} ${el.efficiencyRating} ${ticks}` : code;
  return (
    <Text
      x={el.x - 20}
      y={el.y + 26}
      text={label}
      fontSize={10}
      fontStyle="bold"
      fontFamily="Arial, sans-serif"
      fill="#1a1a1a"
      listening={false}
    />
  );
}

export function ElementsLayer({ dragPreview, onElementClick, rubberBand }: ElementsLayerProps) {
  const elements = useCanvasStore((s) => s.elements);
  const pipes = useCanvasStore((s) => s.pipes);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const moveMultiple = useCanvasStore((s) => s.moveMultiple);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const groupRef = useRef<Konva.Group>(null);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const isMultiSelect = selectedIds.length > 1;

  const groupElements = useMemo(
    () => elements.filter((el) => selectedIdSet.has(el.id)),
    [elements, selectedIdSet],
  );
  const normalElements = useMemo(
    () => elements.filter((el) => !selectedIdSet.has(el.id)),
    [elements, selectedIdSet],
  );

  // Bounding box for the multi-select Group's transparent hit area
  const groupBBox = useMemo(() => {
    if (groupElements.length === 0) return null;
    const xs = groupElements.map((el) => el.x);
    const ys = groupElements.map((el) => el.y);
    return {
      minX: Math.min(...xs) - 28,
      minY: Math.min(...ys) - 28,
      maxX: Math.max(...xs) + 28,
      maxY: Math.max(...ys) + 28,
    };
  }, [groupElements]);

  const handleGroupDragEnd = useCallback(() => {
    const group = groupRef.current;
    if (!group) return;
    const dx = group.x();
    const dy = group.y();
    group.position({ x: 0, y: 0 });
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      moveMultiple(selectedIds, dx, dy);
    }
  }, [selectedIds, moveMultiple]);

  return (
    <Layer>
      {pipes.map((pipe) => (
        <PipeElement
          key={pipe.id}
          id={pipe.id}
          pipeType={pipe.pipeType}
          startX={pipe.startX}
          startY={pipe.startY}
          endX={pipe.endX}
          endY={pipe.endY}
          isSelected={selectedId === pipe.id}
        />
      ))}

      {/* Normal (non-multi-selected) elements — individually draggable */}
      {normalElements.map((el) => (
        <React.Fragment key={el.id}>
          <SymbolNode
            id={el.id}
            symbolId={el.symbolId}
            imageUrl={symbolsApi.getImageUrl(el.symbolId)}
            x={el.x}
            y={el.y}
            rotation={el.rotation}
            scaleX={el.scaleX ?? 1}
            isSelected={selectedId === el.id}
            tintPipeType={TINT_SYMBOL_IDS.has(el.symbolId) ? getElbowTeeTint(el, elements, pipes) : null}
            onHoverEnter={() => setHoveredId(el.id)}
            onHoverLeave={() => setHoveredId(null)}
            onElementClick={onElementClick}
          />
          <WaterFittingsLabel el={el} />
        </React.Fragment>
      ))}

      {/* Multi-select group — all selected elements drag together */}
      {isMultiSelect && groupBBox && (
        <Group
          ref={groupRef}
          draggable
          onDragEnd={handleGroupDragEnd}
          onMouseEnter={(e) => {
            const stage = (e.target as Konva.Node).getStage();
            if (stage) stage.container().style.cursor = 'move';
          }}
          onMouseLeave={(e) => {
            const stage = (e.target as Konva.Node).getStage();
            if (stage) stage.container().style.cursor = 'default';
          }}
        >
          {/* Transparent hit area so the group can be dragged from any point */}
          <Rect
            x={groupBBox.minX}
            y={groupBBox.minY}
            width={groupBBox.maxX - groupBBox.minX}
            height={groupBBox.maxY - groupBBox.minY}
            fill="transparent"
          />
          {/* Selection highlight behind each element */}
          {groupElements.map((el) => (
            <Rect
              key={`sel-${el.id}`}
              x={el.x - 27}
              y={el.y - 27}
              width={54}
              height={54}
              stroke="#0066cc"
              strokeWidth={1.5}
              dash={[4, 3]}
              fill="rgba(0,102,204,0.07)"
              listening={false}
            />
          ))}
          {/* Selected SymbolNodes — non-draggable (the group handles dragging) */}
          {groupElements.map((el) => (
            <React.Fragment key={el.id}>
              <SymbolNode
                id={el.id}
                symbolId={el.symbolId}
                imageUrl={symbolsApi.getImageUrl(el.symbolId)}
                x={el.x}
                y={el.y}
                rotation={el.rotation}
                scaleX={el.scaleX ?? 1}
                isSelected={false}
                draggable={false}
                tintPipeType={TINT_SYMBOL_IDS.has(el.symbolId) ? getElbowTeeTint(el, elements, pipes) : null}
                onHoverEnter={undefined}
                onHoverLeave={undefined}
                onElementClick={onElementClick}
              />
              <WaterFittingsLabel el={el} />
            </React.Fragment>
          ))}
        </Group>
      )}

      {/* Port connection status indicators — always visible on every element */}
      {(() => {
        const connStatus = computePortConnectionStatus(elements, pipes);
        return elements.flatMap((el) => {
          const ports = SYMBOL_PORTS[el.symbolId] ?? [];
          const elStatus = connStatus.get(el.id) ?? [];
          return ports.map((port, i) => {
            // Exception: water_meter upstream inlet is the mains source — no pipe expected
            const isExempt = el.symbolId === 'water_meter' && port.role === 'upstream';
            if (isExempt) return null;

            const pos = getPortPosition(el, port);
            const connected = elStatus[i] ?? false;

            // Place indicator outward from element centre, past the port dot
            const relX = pos.x - el.x;
            const relY = pos.y - el.y;
            const len = Math.sqrt(relX * relX + relY * relY) || 1;
            const ix = pos.x + (relX / len) * 11;
            const iy = pos.y + (relY / len) * 11;

            return (
              <Text
                key={`${el.id}-connstatus-${i}`}
                x={ix - 5}
                y={iy - 6}
                text={connected ? '✓' : '✗'}
                fontSize={9}
                fontStyle="bold"
                fill={connected ? '#22c55e' : '#ef4444'}
                listening={false}
              />
            );
          }).filter(Boolean);
        });
      })()}

      {/* Port indicators — shown for the hovered or single-selected element */}
      {elements.flatMap((el) => {
        if (el.id !== hoveredId && el.id !== selectedId) return [];
        const ports = SYMBOL_PORTS[el.symbolId] ?? [];
        return ports.map((port, i) => {
          const pos = getPortPosition(el, port);
          const role = getEffectivePortRole(el, i);
          const label = getEffectivePortLabel(el, i);
          const color = role === 'upstream' ? '#007bff' : '#e63329';
          // Offset label outward from the symbol centre so it doesn't overlap the image
          const relX = pos.x - el.x;
          const relY = pos.y - el.y;
          const { dx, dy } = portLabelOffset(relX, relY);
          return (
            <React.Fragment key={`${el.id}-port-${i}`}>
              <Circle
                x={pos.x}
                y={pos.y}
                radius={5}
                fill={color}
                stroke="#fff"
                strokeWidth={1.5}
                listening={false}
              />
              {label && (
                <Text
                  x={pos.x + dx}
                  y={pos.y + dy}
                  text={label}
                  fontSize={8}
                  fill={color}
                  fontStyle="bold"
                  listening={false}
                />
              )}
            </React.Fragment>
          );
        });
      })}

      {/* Rubber band selection rectangle + live element highlights */}
      {rubberBand && rubberBand.width > 4 && rubberBand.height > 4 && (() => {
        const hits = elements.filter(
          (el) =>
            el.x >= rubberBand.x && el.x <= rubberBand.x + rubberBand.width &&
            el.y >= rubberBand.y && el.y <= rubberBand.y + rubberBand.height,
        );
        return (
          <>
            {/* Highlight each element whose centre is inside the band */}
            {hits.map((el) => (
              <Rect
                key={`rb-hit-${el.id}`}
                x={el.x - 28}
                y={el.y - 28}
                width={56}
                height={56}
                stroke="#0066cc"
                strokeWidth={2}
                fill="rgba(0,102,204,0.15)"
                listening={false}
              />
            ))}
            {/* The dashed rubber band rect */}
            <Rect
              x={rubberBand.x}
              y={rubberBand.y}
              width={rubberBand.width}
              height={rubberBand.height}
              stroke="#0066cc"
              strokeWidth={1}
              dash={[5, 3]}
              fill="rgba(0,102,204,0.06)"
              listening={false}
            />
            {/* Count badge */}
            {hits.length > 0 && (
              <Text
                x={rubberBand.x + rubberBand.width / 2 - 20}
                y={rubberBand.y + rubberBand.height + 6}
                text={`${hits.length} selected`}
                fontSize={11}
                fontStyle="bold"
                fill="#0066cc"
                listening={false}
              />
            )}
          </>
        );
      })()}

      {/* Ghost outline showing where the symbol will land during palette drag */}
      {dragPreview && (
        <Rect
          x={dragPreview.x}
          y={dragPreview.y}
          width={48}
          height={48}
          offsetX={24}
          offsetY={24}
          stroke="#0066cc"
          strokeWidth={1.5}
          dash={[4, 3]}
          fill="rgba(0,102,204,0.06)"
          listening={false}
        />
      )}
      {/* Port preview while dragging from palette */}
      {dragPreview && (SYMBOL_PORTS[dragPreview.symbolId] ?? []).map((port, i) => {
        // Ports on a freshly-dropped symbol have rotation=0, scaleX=1
        const { x: rx, y: ry } = rotateOffset(port.offsetX, port.offsetY, 0);
        const px = dragPreview.x + rx;
        const py = dragPreview.y + ry;
        const color = port.role === 'upstream' ? '#007bff' : '#e63329';
        const { dx, dy } = portLabelOffset(port.offsetX, port.offsetY);
        return (
          <React.Fragment key={`preview-port-${i}`}>
            <Circle
              x={px} y={py}
              radius={5} fill={color}
              stroke="#fff" strokeWidth={1.5}
              opacity={0.85}
              listening={false}
            />
            {port.label && (
              <Text
                x={px + dx} y={py + dy}
                text={port.label}
                fontSize={8} fill={color} fontStyle="bold"
                opacity={0.85}
                listening={false}
              />
            )}
          </React.Fragment>
        );
      })}
    </Layer>
  );
}
