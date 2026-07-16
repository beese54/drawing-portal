import React, { useState, useRef, useMemo, useCallback } from 'react';
import { Layer, Circle, Text, Rect, Group, Line } from 'react-konva';
import Konva from 'konva';
import { useCanvasStore } from '../../store/canvasStore';
import { SymbolNode } from './SymbolNode';
import { PipeElement } from './PipeElement';
import { AnnotationNode } from './AnnotationsLayer';
import { symbolsApi } from '../../api/client';
import { SYMBOL_PORTS, getElementPorts, getPortPosition, rotateOffset, getEffectivePortRole, getEffectivePortLabel, getScaledPortOffset } from '../../utils/symbolPorts';
import { buildBackflowAssemblies } from '../../utils/dcvAssembly';
import { buildElementAdjacency, isElementProtected } from '../../utils/backflowProtection';
import { getSymbolSizePx, isBackflowRiskElement, getBackflowRule, FIXTURE_MWELS_CATEGORY } from '../../types';
import type { CanvasElement, PipeElement as PipeElementType, PipeType } from '../../types';
import { computePortConnectionStatus } from '../../utils/portConnectionStatus';
import { useUiStore } from '../../store/uiStore';

// Symbols that should be tinted to match their upstream pipe colour
const TINT_SYMBOL_IDS = new Set(['tee_junction', 'elbow_bend']);

// Elements that transform or originate fluid — BFS stops here instead of passing through.
// Without this, the BFS can cross a water heater from its hot output back to its cold input.
// Pumps are deliberately NOT included — they move fluid onward without changing whether
// it's hot or cold, so tracing color through them is correct (unlike a water heater/tank).
const FLUID_BOUNDARY_SYMBOLS = new Set([
  'water_heater', 'instantaneous_water_heater',
  'water_tank', 'cold_water_tank', 'pressure_vessel_schematic',
]);

const TINT_MATCH = 3; // px — kept tight so only exact port-to-endpoint connections trigger the tint

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
      for (const upP of getElementPorts(upEl)) {
        const upPos = getPortPosition(upEl, upP);
        if (Math.hypot(upPos.x - ex, upPos.y - ey) < TINT_MATCH) {
          if (upEl.carriesFluid) return upEl.carriesFluid;
          // Stop at fluid-transforming elements — traversing through a water heater
          // from its hot output to its cold input would produce the wrong colour.
          if (FLUID_BOUNDARY_SYMBOLS.has(upEl.symbolId)) return null;
          for (const p2 of getElementPorts(upEl)) {
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

/** Returns the fluid type (cold/hot) for a tee/elbow via BFS traversal from each port
 *  (upstream first), falling back to a stored carriesFluid override only when the BFS
 *  finds nothing reachable (e.g. a template placed before it's wired into the rest of
 *  the drawing) — a successful live trace always wins, so this never masks a real change. */
function getElbowTeeTint(
  el: CanvasElement,
  elements: CanvasElement[],
  pipes: PipeElementType[],
): PipeType | null {
  const ports = getElementPorts(el);
  if (ports.length === 0) return el.carriesFluid ?? null;

  // Determine which port index is upstream
  let upstreamIdx = 0;
  if (el.upstreamPortIndices?.length) {
    upstreamIdx = el.upstreamPortIndices[0];
  } else if (el.upstreamPortIndex !== undefined) {
    upstreamIdx = el.upstreamPortIndex;
  } else {
    const f = ports.findIndex((p) => p.role === 'upstream');
    if (f >= 0) upstreamIdx = f;
  }

  // Try upstream port first, then fall back to all other ports.
  // This handles rotated/flipped elbows where the cold pipe may enter via any port.
  const portOrder = [upstreamIdx, ...ports.map((_, i) => i).filter((i) => i !== upstreamIdx)];
  for (const i of portOrder) {
    const portPos = getPortPosition(el, ports[i]);
    const result = traceFluidFromPos(portPos.x, portPos.y, el.id, elements, pipes);
    if (result) return result;
  }
  return el.carriesFluid ?? null;
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

interface TemplateGhost {
  elements: import('../../types').CanvasElement[];
  pipes: import('../../types').PipeElement[];
  cursorX: number;
  cursorY: number;
}

interface ElementsLayerProps {
  dragPreview?: DragPreview | null;
  templateGhost?: TemplateGhost | null;
  onElementClick?: (id: string, symbolId: string) => void;
  onElementDblClick?: (id: string) => void;
  rubberBand?: RubberBandRect | null;
  onAnnotationDblClick?: (id: string, x: number, y: number, text: string, fontSize: number, maxWidth: number, height: number) => void;
}

/**
 * Returns (dx, dy) offset for a port label so it sits OUTSIDE the symbol bounds.
 * relX/relY = port position relative to the symbol centre.
 */
function portLabelOffset(relX: number, relY: number): { dx: number; dy: number } {
  if (Math.abs(relX) >= Math.abs(relY)) {
    // Horizontal port — place label just outside the port dot (radius 3)
    return relX < 0
      ? { dx: -8, dy: -3 }  // left port
      : { dx:  4, dy: -3 }; // right port
  }
  // Vertical port
  return relY < 0
    ? { dx: -4, dy: -8 }    // top port
    : { dx: -4, dy:  4 };   // bottom port
}

export function ElementsLayer({ dragPreview, templateGhost, onElementClick, onElementDblClick, rubberBand, onAnnotationDblClick }: ElementsLayerProps) {
  const elements = useCanvasStore((s) => s.elements);
  const pipes = useCanvasStore((s) => s.pipes);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const selectedPipeIds = useCanvasStore((s) => s.selectedPipeIds);
  const selectedAnnotationIds = useCanvasStore((s) => s.selectedAnnotationIds);
  const annotations = useCanvasStore((s) => s.annotations);
  const moveMultiple = useCanvasStore((s) => s.moveMultiple);
  const setSelected = useCanvasStore((s) => s.setSelected);
  const drawingScale = useUiStore((s) => s.sheetConfig.drawingScale);
  const insertDcvAssemblies = useCanvasStore((s) => s.insertDcvAssemblies);
  const symPx = getSymbolSizePx(drawingScale);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [warningTooltip, setWarningTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const groupRef = useRef<Konva.Group>(null);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedPipeIdSet = useMemo(() => new Set(selectedPipeIds), [selectedPipeIds]);
  const selectedAnnotationIdSet = useMemo(() => new Set(selectedAnnotationIds), [selectedAnnotationIds]);

  const elemById = useMemo(() => new Map(elements.map((el) => [el.id, el])), [elements]);
  const elementAdj = useMemo(() => buildElementAdjacency(elements, pipes), [elements, pipes]);

  const totalSelected = selectedIds.length + selectedPipeIds.length + selectedAnnotationIds.length;
  const isMultiSelect = totalSelected > 1;

  const groupElements = useMemo(
    () => elements.filter((el) => selectedIdSet.has(el.id)),
    [elements, selectedIdSet],
  );
  const normalElements = useMemo(
    () => elements.filter((el) => !selectedIdSet.has(el.id)),
    [elements, selectedIdSet],
  );
  const selectedAnnotations = useMemo(
    () => annotations.filter((ann) => selectedAnnotationIdSet.has(ann.id)),
    [annotations, selectedAnnotationIdSet],
  );

  // Bounding box for the multi-select Group's transparent hit area
  const groupBBox = useMemo(() => {
    const selectedPipes = pipes.filter((p) => selectedPipeIdSet.has(p.id));
    if (groupElements.length === 0 && selectedPipes.length === 0 && selectedAnnotations.length === 0) return null;
    const xs = groupElements.map((el) => el.x);
    const ys = groupElements.map((el) => el.y);
    for (const p of selectedPipes) {
      xs.push(p.startX, p.endX);
      ys.push(p.startY, p.endY);
    }
    for (const ann of selectedAnnotations) {
      xs.push(ann.x, ann.x + ann.maxWidth);
      ys.push(ann.y);
    }
    return {
      minX: Math.min(...xs) - 4,
      minY: Math.min(...ys) - 4,
      maxX: Math.max(...xs) + 4,
      maxY: Math.max(...ys) + 4,
    };
  }, [groupElements, pipes, selectedPipeIdSet, selectedAnnotations]);

  const handleGroupDragEnd = useCallback(() => {
    const group = groupRef.current;
    if (!group) return;
    const dx = group.x();
    const dy = group.y();
    group.position({ x: 0, y: 0 });
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      moveMultiple(selectedIds, dx, dy, selectedPipeIds, selectedAnnotationIds);
    }
  }, [selectedIds, selectedPipeIds, selectedAnnotationIds, moveMultiple]);

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
          isSelected={selectedId === pipe.id || selectedPipeIdSet.has(pipe.id)}
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
            width={el.width}
            height={el.height}
            rotation={el.rotation}
            scaleX={el.scaleX ?? 1}
            isSelected={selectedId === el.id}
            tintPipeType={TINT_SYMBOL_IDS.has(el.symbolId) ? getElbowTeeTint(el, elements, pipes) : null}
            onHoverEnter={() => setHoveredId(el.id)}
            onHoverLeave={() => setHoveredId(null)}
            onElementClick={onElementClick}
          />
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
          {groupElements.map((el) => {
            const elW = el.width ?? symPx;
            const elH = el.height ?? symPx;
            return (
              <Rect
                key={`sel-${el.id}`}
                x={el.x - elW / 2 - 3}
                y={el.y - elH / 2 - 3}
                width={elW + 6}
                height={elH + 6}
                stroke="#0066cc"
                strokeWidth={0.7}
                dash={[4, 3]}
                fill="rgba(0,102,204,0.07)"
                listening={false}
              />
            );
          })}
          {/* Selected SymbolNodes — non-draggable (the group handles dragging) */}
          {groupElements.map((el) => (
            <React.Fragment key={el.id}>
              <SymbolNode
                id={el.id}
                symbolId={el.symbolId}
                imageUrl={symbolsApi.getImageUrl(el.symbolId)}
                x={el.x}
                y={el.y}
                width={el.width}
                height={el.height}
                rotation={el.rotation}
                scaleX={el.scaleX ?? 1}
                isSelected={false}
                draggable={false}
                tintPipeType={TINT_SYMBOL_IDS.has(el.symbolId) ? getElbowTeeTint(el, elements, pipes) : null}
                onHoverEnter={undefined}
                onHoverLeave={undefined}
                onElementClick={onElementClick}
              />
            </React.Fragment>
          ))}
          {/* Selected annotations — non-draggable (the group handles dragging) */}
          {selectedAnnotations.map((ann) => (
            <AnnotationNode key={ann.id} ann={ann} isSelected draggable={false} selectDisabled onDblClick={onAnnotationDblClick} />
          ))}
        </Group>
      )}

      {/* Port connection status indicators — always visible on every element */}
      {(() => {
        const connStatus = computePortConnectionStatus(elements, pipes);
        return elements.flatMap((el) => {
          const ports = getElementPorts(el);
          const elStatus = connStatus.get(el.id) ?? [];
          return ports.map((port, i) => {
            // Exception: water_meter upstream inlet is the mains source — no pipe expected
            const isExempt = el.symbolId === 'water_meter' && port.role === 'upstream';
            if (isExempt) return null;

            const pos = getPortPosition(el, port);
            const connected = elStatus[i] ?? false;
            const color = connected ? '#22c55e' : '#ef4444';

            // Drawn as vector strokes rather than a text glyph: at this size (~1px)
            // font rasterization/hinting snaps to a coarse pixel grid regardless of
            // how precise pos.x/pos.y are, which made the marker visibly drift from
            // the actual port location. A vector path has no such snapping step.
            return connected ? (
              <Line
                key={`${el.id}-connstatus-${i}`}
                points={[pos.x - 0.6, pos.y, pos.x - 0.15, pos.y + 0.45, pos.x + 0.6, pos.y - 0.5]}
                stroke={color}
                strokeWidth={0.35}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            ) : (
              <Group key={`${el.id}-connstatus-${i}`} listening={false}>
                <Line points={[pos.x - 0.6, pos.y - 0.6, pos.x + 0.6, pos.y + 0.6]} stroke={color} strokeWidth={0.35} lineCap="round" />
                <Line points={[pos.x - 0.6, pos.y + 0.6, pos.x + 0.6, pos.y - 0.6]} stroke={color} strokeWidth={0.35} lineCap="round" />
              </Group>
            );
          }).filter(Boolean);
        });
      })()}

      {/* Long bath — capacity not set badge (PUB requirement: must be indicated on drawing) */}
      {elements.flatMap((el) => {
        if (el.symbolId !== 'long_bath') return [];
        if (el.longBathCapacityL) return []; // capacity is set — no badge
        const bx = el.x + symPx / 2 + 4;
        const by = el.y - symPx / 2 - 4;
        return [
          <Circle
            key={`lb-nocap-badge-${el.id}`}
            x={bx} y={by} radius={4}
            fill="#f97316" stroke="#fff" strokeWidth={1}
            onMouseEnter={() => setWarningTooltip({ x: bx, y: by, lines: ['Long Bath Capacity Not Set', 'Capacity must be indicated on drawing (PUB requirement)', 'Double-click symbol to enter capacity'] })}
            onMouseLeave={() => setWarningTooltip(null)}
            onClick={() => { setWarningTooltip(null); setSelected(el.id); onElementDblClick?.(el.id); }}
          />,
          <Text
            key={`lb-nocap-text-${el.id}`}
            x={bx - 1.3} y={by - 3}
            text="!" fontSize={8} fontStyle="bold" fill="#fff"
            listening={false}
          />,
        ];
      })}

      {/* Long bath >250L capacity badge — recycling facilities required */}
      {elements.flatMap((el) => {
        if (el.symbolId !== 'long_bath') return [];
        if (!el.longBathCapacityL || el.longBathCapacityL <= 250) return [];
        const bx = el.x + symPx / 2 + 4;
        const by = el.y - symPx / 2 - 4;
        return [
          <Circle
            key={`lb-badge-${el.id}`}
            x={bx} y={by} radius={4}
            fill="#f97316" stroke="#fff" strokeWidth={1}
            onMouseEnter={() => setWarningTooltip({ x: bx, y: by, lines: ['Capacity exceeds 250 L (SS636 §6.2)', 'Recycling facilities required — no drain plug, full recirculation, backwash to sewer'] })}
            onMouseLeave={() => setWarningTooltip(null)}
          />,
          <Text
            key={`lb-text-${el.id}`}
            x={bx - 1.3} y={by - 3}
            text="!" fontSize={8} fontStyle="bold" fill="#fff"
            listening={false}
          />,
        ];
      })}

      {/* Backflow-risk warning badges — orange ! when no check valve is nearby */}
      {elements.flatMap((el) => {
        if (!isBackflowRiskElement(el)) return [];
        if (isElementProtected(el, elementAdj, elemById, 6, elements, pipes)) return [];
        const halfW = (el.width ?? symPx) / 2;
        const halfH = (el.height ?? symPx) / 2;
        const bx = el.x + halfW + 4;
        const by = el.y - halfH - 4;
        const rule = getBackflowRule(el);
        const ttLines = rule === 'vb_and_check_valve'
          ? ['Backflow Risk (SS636 §6.5)', 'Requires a vacuum breaker and check valve connected in series', 'Double-click to insert Gate Valve + Check Valve + Vacuum Breaker']
          : ['Backflow Risk (SS636 §6.4)', 'Requires 2 check valves connected in series upstream', 'Double-click to insert Gate Valve + 2 Check Valves'];
        return [
          <Circle
            key={`bf-badge-${el.id}`}
            x={bx} y={by} radius={4}
            fill="#f97316" stroke="#fff" strokeWidth={1}
            onMouseEnter={(e) => {
              setWarningTooltip({ x: bx, y: by, lines: ttLines });
              const stage = (e.target as Konva.Node).getStage();
              if (stage) stage.container().style.cursor = 'pointer';
            }}
            onMouseLeave={(e) => {
              setWarningTooltip(null);
              const stage = (e.target as Konva.Node).getStage();
              if (stage) stage.container().style.cursor = 'default';
            }}
            onDblClick={(e) => {
              e.cancelBubble = true;
              setWarningTooltip(null);
              const asms = buildBackflowAssemblies(el.id, '', elements, pipes);
              if (asms.length > 0) {
                insertDcvAssemblies(asms.map((a) => ({
                  elements: a.elements, targetPipeId: a.targetPipeId, snapX: a.snapX, snapY: a.snapY,
                })));
              }
            }}
          />,
          <Text
            key={`bf-text-${el.id}`}
            x={bx - 1.3} y={by - 3}
            text="!" fontSize={8} fontStyle="bold" fill="#fff"
            listening={false}
          />,
        ];
      })}

      {/* MWELS efficiency rating missing badges — orange ! when no rating ticks set */}
      {elements.flatMap((el) => {
        if (!(el.symbolId in FIXTURE_MWELS_CATEGORY)) return [];
        if (el.efficiencyRating) return [];
        const bx = el.x + symPx / 2 + 4;
        const by = el.y - symPx / 2 - 4;
        return [
          <Circle
            key={`mwels-badge-${el.id}`}
            x={bx} y={by} radius={4}
            fill="#f97316" stroke="#fff" strokeWidth={1}
            onMouseEnter={() => setWarningTooltip({ x: bx, y: by, lines: ['MWELS Rating Missing', 'Double-click symbol to set efficiency ticks'] })}
            onMouseLeave={() => setWarningTooltip(null)}
            onClick={() => { setWarningTooltip(null); setSelected(el.id); onElementDblClick?.(el.id); }}
          />,
          <Text
            key={`mwels-text-${el.id}`}
            x={bx - 1.3} y={by - 3}
            text="!" fontSize={8} fontStyle="bold" fill="#fff"
            listening={false}
          />,
        ];
      })}

      {/* Pump rated head missing badge — orange ! when pump head not declared */}
      {elements.flatMap((el) => {
        if (el.symbolId !== 'pump') return [];
        if (el.pumpRatedHeadM !== undefined) return [];
        const bx = el.x + symPx / 2 + 4;
        const by = el.y - symPx / 2 - 4;
        return [
          <Circle
            key={`pump-head-badge-${el.id}`}
            x={bx} y={by} radius={4}
            fill="#f97316" stroke="#fff" strokeWidth={1}
            onMouseEnter={() => setWarningTooltip({ x: bx, y: by, lines: ['Pump Rated Head Not Declared', 'Double-click symbol to enter rated head (m) from pump schedule'] })}
            onMouseLeave={() => setWarningTooltip(null)}
            onClick={() => { setWarningTooltip(null); setSelected(el.id); onElementDblClick?.(el.id); }}
          />,
          <Text
            key={`pump-head-text-${el.id}`}
            x={bx - 1.3} y={by - 3}
            text="!" fontSize={8} fontStyle="bold" fill="#fff"
            listening={false}
          />,
        ];
      })}

      {/* Port indicators — shown for the hovered or single-selected element */}
      {elements.flatMap((el) => {
        if (el.id !== hoveredId && el.id !== selectedId) return [];
        const ports = getElementPorts(el);
        return ports.map((port, i) => {
          const pos = getPortPosition(el, port);
          const role = getEffectivePortRole(el, i);
          const label = getEffectivePortLabel(el, i);
          const color = label === 'Cold' ? '#007bff'
            : label === 'Hot' ? '#e63329'
            : role === 'upstream' ? '#007bff'
            : '#e63329';
          // Offset label outward from the symbol centre so it doesn't overlap the image
          const relX = pos.x - el.x;
          const relY = pos.y - el.y;
          const { dx, dy } = portLabelOffset(relX, relY);
          return (
            <React.Fragment key={`${el.id}-port-${i}`}>
              <Circle
                x={pos.x}
                y={pos.y}
                radius={1}
                fill={color}
                stroke="#fff"
                strokeWidth={0.5}
                listening={false}
              />
              {label && (
                <Text
                  x={pos.x + dx}
                  y={pos.y + dy}
                  text={label}
                  fontSize={2}
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
        const hitEls = elements.filter(
          (el) =>
            el.x >= rubberBand.x && el.x <= rubberBand.x + rubberBand.width &&
            el.y >= rubberBand.y && el.y <= rubberBand.y + rubberBand.height,
        );
        const hitPipes = pipes.filter(
          (p) =>
            p.startX >= rubberBand.x && p.startX <= rubberBand.x + rubberBand.width &&
            p.startY >= rubberBand.y && p.startY <= rubberBand.y + rubberBand.height &&
            p.endX   >= rubberBand.x && p.endX   <= rubberBand.x + rubberBand.width &&
            p.endY   >= rubberBand.y && p.endY   <= rubberBand.y + rubberBand.height,
        );
        const hitAnns = annotations.filter(
          (ann) =>
            ann.x >= rubberBand.x && ann.x <= rubberBand.x + rubberBand.width &&
            ann.y >= rubberBand.y && ann.y <= rubberBand.y + rubberBand.height,
        );
        const totalHits = hitEls.length + hitPipes.length + hitAnns.length;
        return (
          <>
            {/* Highlight each element whose centre is inside the band */}
            {hitEls.map((el) => {
              const elW = el.width ?? symPx;
              const elH = el.height ?? symPx;
              return (
                <Rect
                  key={`rb-hit-${el.id}`}
                  x={el.x - elW / 2 - 4}
                  y={el.y - elH / 2 - 4}
                  width={elW + 8}
                  height={elH + 8}
                  stroke="#0066cc"
                  strokeWidth={0.7}
                  fill="rgba(0,102,204,0.15)"
                  listening={false}
                />
              );
            })}
            {/* Highlight each pipe whose endpoints are both inside the band — previously
                missing, so a captured pipe silently added to the "N selected" count with
                no visual indication of what was actually being selected. */}
            {hitPipes.map((p) => (
              <Line
                key={`rb-hit-pipe-${p.id}`}
                points={[p.startX, p.startY, p.endX, p.endY]}
                stroke="#0066cc"
                strokeWidth={2}
                opacity={0.35}
                lineCap="round"
                listening={false}
              />
            ))}
            {/* Highlight each annotation whose origin is inside the band */}
            {hitAnns.map((ann) => {
              const lineCount = Math.max(1, ann.text.split('\n').length);
              const annH = ann.fontSize * 1.35 * lineCount;
              return (
                <Rect
                  key={`rb-hit-${ann.id}`}
                  x={ann.x - 2}
                  y={ann.y - 2}
                  width={ann.maxWidth + 4}
                  height={annH + 4}
                  stroke="#0066cc"
                  strokeWidth={0.7}
                  fill="rgba(0,102,204,0.15)"
                  listening={false}
                />
              );
            })}
            {/* The dashed rubber band rect */}
            <Rect
              x={rubberBand.x}
              y={rubberBand.y}
              width={rubberBand.width}
              height={rubberBand.height}
              stroke="#0066cc"
              strokeWidth={0.7}
              dash={[5, 3]}
              fill="rgba(0,102,204,0.06)"
              listening={false}
            />
            {/* Count badge */}
            {totalHits > 0 && (
              <Text
                x={rubberBand.x + rubberBand.width / 2 - 20}
                y={rubberBand.y + rubberBand.height + 6}
                text={`${totalHits} selected`}
                fontSize={6}
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
          width={symPx}
          height={symPx}
          offsetX={symPx / 2}
          offsetY={symPx / 2}
          stroke="#0066cc"
          strokeWidth={0.5}
          dash={[1, 1]}
          fill="rgba(0,102,204,0.06)"
          listening={false}
        />
      )}
      {/* Port preview while dragging from palette */}
      {dragPreview && (SYMBOL_PORTS[dragPreview.symbolId] ?? []).map((port, i) => {
        const { ox, oy } = getScaledPortOffset(dragPreview.symbolId, port, symPx, symPx, 1);
        const { x: rx, y: ry } = rotateOffset(ox, oy, 0);
        const px = dragPreview.x + rx;
        const py = dragPreview.y + ry;
        const color = port.role === 'upstream' ? '#007bff' : '#e63329';
        const { dx, dy } = portLabelOffset(port.offsetX, port.offsetY);
        return (
          <React.Fragment key={`preview-port-${i}`}>
            <Circle
              x={px} y={py}
              radius={1} fill={color}
              stroke="#fff" strokeWidth={0.5}
              opacity={0.85}
              listening={false}
            />
            {port.label && (
              <Text
                x={px + dx} y={py + dy}
                text={port.label}
                fontSize={2} fill={color} fontStyle="bold"
                opacity={0.85}
                listening={false}
              />
            )}
          </React.Fragment>
        );
      })}
      {/* Warning tooltip — shown on hover over ! badges */}
      {warningTooltip && (() => {
        const PAD = 1.5;
        const LINE_H = 2.5;
        const W = 36;
        const H = warningTooltip.lines.length * LINE_H + PAD * 2;
        return (
          <Group x={warningTooltip.x + 8} y={warningTooltip.y - H - 6} listening={false}>
            <Rect
              x={0} y={0} width={W} height={H}
              fill="#1f2937" cornerRadius={3} opacity={0.93}
              shadowColor="black" shadowBlur={6} shadowOpacity={0.25} shadowOffsetY={1}
            />
            {warningTooltip.lines.map((line, i) => (
              <Text
                key={i}
                x={PAD} y={PAD + i * LINE_H}
                text={line}
                fontSize={1}
                fill={i === 0 ? '#fbbf24' : '#d1d5db'}
                fontStyle={i === 0 ? 'bold' : 'normal'}
                width={W - PAD * 2}
                wrap="word"
                listening={false}
              />
            ))}
          </Group>
        );
      })()}

      {/* Template ghost — semi-transparent preview following the cursor before placement */}
      {templateGhost && (() => {
        const { elements: gEls, pipes: gPipes, cursorX, cursorY } = templateGhost;
        const xs = [...gEls.map((e) => e.x), ...gPipes.flatMap((p) => [p.startX, p.endX])];
        const ys = [...gEls.map((e) => e.y), ...gPipes.flatMap((p) => [p.startY, p.endY])];
        if (xs.length === 0) return null;
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const dx = cursorX - cx;
        const dy = cursorY - cy;
        return (
          <Group opacity={0.5} listening={false}>
            {gPipes.map((p) => (
              <Line
                key={p.id}
                points={[p.startX + dx, p.startY + dy, p.endX + dx, p.endY + dy]}
                stroke={p.pipeType === 'hot' ? '#ef4444' : '#0066cc'}
                strokeWidth={0.75}
              />
            ))}
            {gEls.map((e) => (
              <Rect
                key={e.id}
                x={e.x + dx}
                y={e.y + dy}
                width={e.width}
                height={e.height}
                offsetX={e.width / 2}
                offsetY={e.height / 2}
                stroke="#0066cc"
                strokeWidth={0.5}
                dash={[1, 1]}
                fill="rgba(0,102,204,0.08)"
              />
            ))}
          </Group>
        );
      })()}
    </Layer>
  );
}
