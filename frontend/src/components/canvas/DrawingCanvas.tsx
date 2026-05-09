import { useRef, useEffect, useState, useCallback } from 'react';
import { Stage } from 'react-konva';
import Konva from 'konva';
import { GridLayer } from './GridLayer';
import { ElementsLayer } from './ElementsLayer';
import { PipeDraftLayer } from './PipeDraftLayer';
import { RotationPanel } from './RotationPanel';
import { TeeJunctionPortDialog } from './TeeJunctionPortDialog';
import { ElbowBendPortDialog } from './ElbowBendPortDialog';
import { FlipOrientationDialog } from './FlipOrientationDialog';
import { WaterFittingsDialog } from './WaterFittingsDialog';
import { FittingTypePanel } from './FittingTypePanel';
import { LongBathPanel } from './LongBathPanel';
import { PdfBackgroundLayer } from './PdfBackgroundLayer';
import { PipePropertiesModal } from './PipePropertiesModal';
import { WaterTankPropertiesModal } from './WaterTankPropertiesModal';
import { useUiStore } from '../../store/uiStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { CanvasElement, PipeElement as PipeElementType, ROTATABLE_SYMBOL_IDS, FLIP_ONLY_SYMBOL_IDS } from '../../types';
import { symbolsApi } from '../../api/client';
import { closestPointOnSegment, distance } from '../../utils/geometry';
import { SYMBOL_PORTS, rotateOffset, getPortPosition, getEffectivePortRole } from '../../utils/symbolPorts';
import { renderPdfPageToDataUrl } from '../../utils/pdfRenderer';

const AXIS_WIDTH = 64;
const SYMBOL_SIZE = 48;
const SNAP_THRESHOLD = 80;
const SNAP_T_MIN = 0.02;
const SNAP_T_MAX = 0.98;

// Virtual canvas is 3× the viewport height so MRL intervals have more space
const VIRTUAL_HEIGHT_FACTOR = 3;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.0;
const SCALE_STEP = 0.2;

// Symbols where the pipe passes straight through inlet → outlet (split at both ports)
const INLINE_SYMBOL_IDS = new Set([
  'gate_valve', 'check_valve', 'pump', 'reducer', 'flow_meter', 'water_heater', 'water_meter',
  // new inline valves & equipment
  'solenoid_valve', 'motorised_valve', 'globe_valve', 'pressure_reducing_valve', 'prv_with_sensor',
  'jockey_pump', 'sub_meter', 'cold_water_tank', 'grease_interceptor', 'dilution_tank',
  'strainer_basket', 'pressure_gauge_prv', 'sight_glass', 'strainer',
  'multiport_valve', 'sampling_tap',
]);
// Symbols where the pipe terminates at the connection port (no pipe continues through)
const TERMINAL_SYMBOL_IDS = new Set([
  'water_tank', 'fire_hydrant', 'sump_manhole', 'water_fittings',
  // fixtures
  'single_tap', 'single_tap_combined', 'twin_tap', 'shower_head',
  'long_bath', 'shower_bath',
  'drinking_fountain_pedestal', 'drinking_fountain_trough', 'drinking_fountain_wall',
  'wash_basin', 'water_closet', 'urinal_wall',
  // terminal valves & equipment (single upstream port)
  'cap_off_valve',
  'auto_air_relief_valve', 'pressure_gauge_cock', 'water_hammer_absorber',
  'pressure_vessel_schematic', 'water_tank_air_vent',
  'vortex_inhibitor', 'vortex_inhibitor_schematic', 'tap_point_schematic', 'ball_float_valve',
]);

/**
 * Infers what fluid type (cold/hot) flows through a given pipe.
 * For cold/hot pipes the answer is direct. For generic pipes the function looks
 * for an upstream element (one whose downstream port touches either pipe endpoint)
 * and returns that element's carriesFluid value, enabling series propagation.
 */
function inferFluidFromPipe(
  pipe: PipeElementType,
  allElements: CanvasElement[],
): 'cold' | 'hot' | undefined {
  if (pipe.pipeType === 'cold' || pipe.pipeType === 'hot') return pipe.pipeType;
  // Generic pipe — follow it back to the upstream element's stored carriesFluid
  const MATCH = 20;
  for (const el of allElements) {
    const ports = SYMBOL_PORTS[el.symbolId] ?? [];
    for (const port of ports) {
      if (port.role !== 'downstream') continue;
      const pos = getPortPosition(el, port);
      if (
        Math.hypot(pos.x - pipe.startX, pos.y - pipe.startY) < MATCH ||
        Math.hypot(pos.x - pipe.endX,   pos.y - pipe.endY)   < MATCH
      ) {
        return el.carriesFluid;
      }
    }
  }
  return undefined;
}

function getInlinePortPositions(el: CanvasElement) {
  const ports = SYMBOL_PORTS[el.symbolId] ?? [];
  const inletPort  = ports.find((p) => p.role === 'upstream');
  const outletPort = ports.find((p) => p.role === 'downstream');
  return {
    inletPos:  inletPort  ? getPortPosition(el, inletPort)  : { x: el.x, y: el.y },
    outletPos: outletPort ? getPortPosition(el, outletPort) : { x: el.x, y: el.y },
  };
}

interface DrawingCanvasProps {
  onSizeChange?: (width: number, height: number) => void;
}

export function DrawingCanvas({ onSizeChange }: DrawingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1600, height: 600 });

  // Virtual canvas scroll/zoom state
  const [stageOffsetY, setStageOffsetY] = useState(0); // viewport px scrolled
  const [stageOffsetX, setStageOffsetX] = useState(0);
  const [stageScale, setStageScale] = useState(1.0);
  const scrollbarDragRef = useRef<{ startY: number; startOffset: number } | null>(null);
  const horizontalScrollbarDragRef = useRef<{startX: number; startOffset: number;} | null>(null);

  // Derived virtual canvas dimensions
  const virtualHeight = canvasSize.height * VIRTUAL_HEIGHT_FACTOR;
  const maxOffset = Math.max(0, virtualHeight * stageScale - canvasSize.height);
  const virtualWidth = canvasSize.width * 2;
  const maxOffsetX = Math.max(0, virtualWidth * stageScale - canvasSize.width);
  
  const horizontalThumbWidth =
    maxOffsetX > 0
      ? Math.max(40, (canvasSize.width / (virtualWidth * stageScale)) * canvasSize.width)
      : canvasSize.width;

  const horizontalThumbLeft =
    maxOffsetX > 0
      ? (stageOffsetX / maxOffsetX) * (canvasSize.width - horizontalThumbWidth)
      : 0;

  // Zoom helper — keeps viewport centre fixed in content space
  const zoom = useCallback((delta: number) => {
    setStageScale((prevScale) => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prevScale + delta));
      if (newScale === prevScale) return prevScale;
      setStageOffsetY((prevOffset) => {
        const vHeight = canvasSize.height;
        const virt = vHeight * VIRTUAL_HEIGHT_FACTOR;
        const contentCenterY = (prevOffset + vHeight / 2) / prevScale;
        const newOffset = contentCenterY * newScale - vHeight / 2;
        return Math.max(0, Math.min(newOffset, Math.max(0, virt * newScale - vHeight)));
      });
      return newScale;
    });
  }, [canvasSize.height]);

  // Convert virtual canvas (content) coords to viewport px (for overlay panels)
  const contentToViewport = useCallback(
    (cx: number, cy: number) => ({
      x: cx * stageScale - stageOffsetX,
      y: cy * stageScale - stageOffsetY,
    }),
    [stageScale, stageOffsetX, stageOffsetY]
  );

  // PDF background — state lives in uiStore; DrawingCanvas registers the import handler
  // because it needs access to the current viewport/zoom state for initial placement.
  const pdfBackground = useUiStore((s) => s.pdfBackground);
  const setPdfBackground = useUiStore((s) => s.setPdfBackground);
  const updatePdfBackground = useUiStore((s) => s.updatePdfBackground);
  const registerPdfImport = useUiStore((s) => s.registerPdfImport);

  useEffect(() => {
    const handler = async (file: File) => {
      try {
        const { dataUrl, naturalWidth, naturalHeight } = await renderPdfPageToDataUrl(file);
        const viewportContentW = canvasSize.width / stageScale;
        const viewportContentH = canvasSize.height / stageScale;
        const targetW = viewportContentW * 0.9;
        const targetH = (naturalHeight / naturalWidth) * targetW;
        // x, y are the CENTER of the image in content coords
        const cx = stageOffsetX / stageScale + viewportContentW / 2;
        const cy = stageOffsetY / stageScale + viewportContentH / 2;
        setPdfBackground({ dataUrl, x: cx, y: cy, width: targetW, height: targetH, rotation: 0, locked: false });
      } catch (err) {
        console.error('PDF import failed:', err);
        alert('Could not read the PDF. Please try a different file.');
      }
    };
    registerPdfImport(handler);
  }, [canvasSize, stageScale, stageOffsetX, stageOffsetY, setPdfBackground, registerPdfImport]);

  const mrlConfig   = useUiStore((s) => s.mrlConfig);
  const floorLevels = useUiStore((s) => s.floorLevels);
  const activeTool  = useUiStore((s) => s.activeTool);
  const draggingSymbolId = useUiStore((s) => s.draggingSymbolId);
  const setDraggingSymbolId = useUiStore((s) => s.setDraggingSymbolId);
  const pendingSymbol = useUiStore((s) => s.pendingSymbol);
  const setPendingSymbol = useUiStore((s) => s.setPendingSymbol);
  const registerExportJpg = useUiStore((s) => s.registerExportJpg);

  const [dragOverPos, setDragOverPos] = useState<{ x: number; y: number } | null>(null);

  // Rubber band (marquee) selection state
  const [rubberAnchor, setRubberAnchor] = useState<{ x: number; y: number } | null>(null);
  const [rubberCurrent, setRubberCurrent] = useState<{ x: number; y: number } | null>(null);
  const rubberDraggedRef = useRef(false);
  // Refs mirror anchor/current so event handlers always see the latest value
  // without depending on potentially-stale React state closures.
  const rubberAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const rubberCurrentRef = useRef<{ x: number; y: number } | null>(null);

  const rubberBandRect = rubberAnchor && rubberCurrent ? {
    x: Math.min(rubberAnchor.x, rubberCurrent.x),
    y: Math.min(rubberAnchor.y, rubberCurrent.y),
    width: Math.abs(rubberCurrent.x - rubberAnchor.x),
    height: Math.abs(rubberCurrent.y - rubberAnchor.y),
  } : null;

  // Pending tee junction: element + optional pipe snap, awaiting port selection
  const [pendingTee, setPendingTee] = useState<{
    element: CanvasElement;
    pipeId: string;
    snapX: number;
    snapY: number;
    elX: number;
    elY: number;
    snapped: boolean;
  } | null>(null);
  const teeConfirmedRef = useRef(false);

  // Pending elbow bend: awaiting inlet port selection
  const [pendingElbow, setPendingElbow] = useState<{
    element: CanvasElement;
    pipeId: string;
    snapX: number;
    snapY: number;
    elX: number;
    elY: number;
    snapped: boolean;
  } | null>(null);

  // Pending flip-only symbol: awaiting orientation selection
  const [pendingFlip, setPendingFlip] = useState<{
    element: CanvasElement;
    pipeId: string;
    snapX: number;
    snapY: number;
    snapped: boolean;
  } | null>(null);

  // Water tank: id of the tank whose properties modal is open
  const [tankModalId, setTankModalId] = useState<string | null>(null);
  const tankModalOpenRef = useRef(false);
  tankModalOpenRef.current = !!tankModalId;

  // Pending water fittings: awaiting fitting type selection
  const [pendingWaterFittings, setPendingWaterFittings] = useState<{
    element: CanvasElement;
    pipeId: string;
    snapX: number;
    snapY: number;
    snapped: boolean;
  } | null>(null);
  const setSelected = useCanvasStore((s) => s.setSelected);
  const setSelectedIds = useCanvasStore((s) => s.setSelectedIds);
  const addElement = useCanvasStore((s) => s.addElement);
  const insertElementOnPipe = useCanvasStore((s) => s.insertElementOnPipe);
  const insertElementOnPipeInline = useCanvasStore((s) => s.insertElementOnPipeInline);

  // Register JPG export function — captures the full virtual canvas (entire MRL range)
  useEffect(() => {
    registerExportJpg(() => {
      const stage = stageRef.current;
      if (!stage) return;

      // Save current transform
      const prevY      = stage.y();
      const prevScaleX = stage.scaleX();
      const prevScaleY = stage.scaleY();
      const prevHeight = stage.height();
      const vHeight    = canvasSize.height * VIRTUAL_HEIGHT_FACTOR;

      // Reset to full-canvas view at scale=1
      stage.y(0);
      stage.scaleX(1);
      stage.scaleY(1);
      stage.height(vHeight);
      stage.draw();

      // Export as PNG first (preserves transparency), then composite onto white
      const pngUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio: 2 });

      // Restore immediately so the UI isn't frozen waiting for the image to load
      stage.y(prevY);
      stage.scaleX(prevScaleX);
      stage.scaleY(prevScaleY);
      stage.height(prevHeight);
      stage.draw();

      const img = new Image();
      img.onload = () => {
        const offscreen = document.createElement('canvas');
        offscreen.width = img.width;
        offscreen.height = img.height;
        const ctx = offscreen.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, offscreen.width, offscreen.height);
        ctx.drawImage(img, 0, 0);

        const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const a = document.createElement('a');
        a.href = offscreen.toDataURL('image/jpeg', 0.95);
        a.download = `schematic_${ts}.jpg`;
        a.click();
      };
      img.src = pngUrl;
    });
  }, [registerExportJpg, canvasSize.height]);

  // Delete selected element or pipe with Delete/Backspace key; Escape clears pending placement
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        useUiStore.getState().setPendingSymbol(null);
        useCanvasStore.getState().setSelectedIds([]);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        useCanvasStore.getState().copySelection();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        useCanvasStore.getState().pasteClipboard();
        return;
      }

      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const { selectedId, selectedIds, elements, pipes, removeElement, removePipe } = useCanvasStore.getState();
      // Multi-select delete
      if (selectedIds.length > 0) {
        for (const id of selectedIds) {
          if (elements.some((el) => el.id === id)) removeElement(id);
          else if (pipes.some((p) => p.id === id)) removePipe(id);
        }
        return;
      }
      if (!selectedId) return;
      if (elements.some((el) => el.id === selectedId)) removeElement(selectedId);
      else if (pipes.some((p) => p.id === selectedId)) removePipe(selectedId);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Only show rotation panel for rotatable symbols when selected
  const selectedRotatable = useCanvasStore((s) => {
    const el = s.elements.find((e) => e.id === s.selectedId);
    return el && (ROTATABLE_SYMBOL_IDS as readonly string[]).includes(el.symbolId) ? el : null;
  });

  // Show fitting type panel when a water_fittings element is selected
  const selectedFitting = useCanvasStore((s) => {
    const el = s.elements.find((e) => e.id === s.selectedId);
    return el?.symbolId === 'water_fittings' ? el : null;
  });

  // Show long bath capacity panel when a long_bath element is selected
  const selectedLongBath = useCanvasStore((s) => {
    const el = s.elements.find((e) => e.id === s.selectedId);
    return el?.symbolId === 'long_bath' ? el : null;
  });

  const {
    isDrawingPipe,
    anchorPoint,
    previewEnd,
    pendingChain,
    confirmPipe,
    discardPipe,
    handleCanvasClick,
    handleCanvasMouseMove,
  } = useCanvasInteraction();

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const w = Math.max(width, 400);
      const h = Math.max(height, 400);
      setCanvasSize({ width: w, height: h });
      // Report virtual height so MRL → elevation mapping covers the full virtual canvas
      onSizeChange?.(w, h * VIRTUAL_HEIGHT_FACTOR);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onSizeChange]);

  // Wheel scroll — must be non-passive to call preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (tankModalOpenRef.current) return;
      e.preventDefault();

      // Detect horizontal vs vertical scrolling
      const deltaX = e.shiftKey ? e.deltaY : e.deltaX;
      const deltaY = e.shiftKey ? 0 : e.deltaY;

      // Horizontal scroll
      setStageOffsetX((prev) => {
        const virtW = canvasSize.width * 2; // your virtual width
        const mo = Math.max(0, virtW * stageScale - canvasSize.width);
        return Math.max(0, Math.min(prev + deltaX, mo));
      });

      // Vertical scroll
      setStageOffsetY((prev) => {
        const virtH = canvasSize.height * VIRTUAL_HEIGHT_FACTOR;
        const mo = Math.max(0, virtH * stageScale - canvasSize.height);
        return Math.max(0, Math.min(prev + deltaY, mo));
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [canvasSize.width, canvasSize.height, stageScale]);

  const getCursor = () => {
    if (isDrawingPipe) return 'crosshair';
    return 'default';
  };

  const getCanvasPos = useCallback(
    (clientX: number, clientY: number) => {
      if (!stageRef.current) return null;
      const stageBox = stageRef.current.container().getBoundingClientRect();
      const rawX = clientX - stageBox.left;
      const rawY = clientY - stageBox.top;
      // Convert viewport px → virtual canvas content coordinates
      const contentX = (rawX + stageOffsetX) / stageScale;
      const contentY = (rawY + stageOffsetY) / stageScale;
      return {
        x: Math.max(AXIS_WIDTH + SYMBOL_SIZE / 2, contentX),
        y: Math.max(SYMBOL_SIZE / 2, Math.min(contentY, virtualHeight - SYMBOL_SIZE / 2)),
      };
    },
    [stageScale, stageOffsetX, stageOffsetY, virtualHeight]
  );

  // Open water tank modal on click
  const handleElementClick = useCallback((_id: string, symbolId: string) => {
    if (symbolId === 'water_tank') {
      setTankModalId(_id);
    }
  }, []);

  // Core placement logic shared by drag-drop and tap-to-place
  const placeSymbolAt = useCallback(
    (x: number, y: number, symbolId: string, symbolName: string) => {
      let el: CanvasElement = {
        id: crypto.randomUUID(),
        symbolId,
        symbolName,
        x,
        y,
        rotation: 0,
        width: SYMBOL_SIZE,
        height: SYMBOL_SIZE,
      };

      // Port-aware snap: align the closest port of the dropped symbol to the nearest pipe
      const { pipes, elements: placedElements } = useCanvasStore.getState();
      const symbolPorts = SYMBOL_PORTS[symbolId] ?? [];
      let snapped = false;
      let bestDist = SNAP_THRESHOLD;
      let bestPipeId = '';
      let bestSnapX = x;
      let bestSnapY = y;
      let bestElX = x;
      let bestElY = y;

      const isInlineOrTerminal = INLINE_SYMBOL_IDS.has(symbolId) || TERMINAL_SYMBOL_IDS.has(symbolId);
      // Inline/terminal symbols only snap their inlet (upstream) port.
      const portsToSnap = isInlineOrTerminal
        ? symbolPorts.filter((p) => p.role === 'upstream')
        : symbolPorts;

      // ── Unified snap strategy ──────────────────────────────────────────────
      // Step 1: Select the pipe closest to the DROP POINT.
      //   Using the drop point (not port positions) ensures the user's cursor
      //   intent wins even when offset ports happen to be closer to a
      //   neighbouring pipe.
      let targetPipe = null as (typeof pipes)[0] | null;
      let targetPipeDist = SNAP_THRESHOLD;
      for (const pipe of pipes) {
        const { x: sx, y: sy } = closestPointOnSegment(
          x, y, pipe.startX, pipe.startY, pipe.endX, pipe.endY
        );
        const d = distance(x, y, sx, sy);
        if (d < targetPipeDist) {
          targetPipeDist = d;
          targetPipe = pipe;
        }
      }

      if (targetPipe) {
        const tp = targetPipe;

        if (isInlineOrTerminal) {
          // Returns true if (px,py) sits on an existing symbol's INLET port.
          // Snapping a new symbol's inlet to another symbol's inlet causes
          // overlap — skip those endpoints.
          const isAtSymbolInlet = (px: number, py: number): boolean =>
            placedElements.some((el) => {
              const ports = SYMBOL_PORTS[el.symbolId] ?? [];
              return ports.some((_, i) => {
                const pos = getPortPosition(el, ports[i]);
                return distance(px, py, pos.x, pos.y) < 10
                  && getEffectivePortRole(el, i) === 'upstream';
              });
            });

          // Step 2a: Endpoint snap on the selected pipe only.
          let endpointSnapped = false;
          for (const port of portsToSnap) {
            const rot = rotateOffset(port.offsetX, port.offsetY, 0);
            const portAbsX = x + rot.x;
            const portAbsY = y + rot.y;
            for (const [ex, ey] of [
              [tp.startX, tp.startY],
              [tp.endX,   tp.endY  ],
            ] as [number, number][]) {
              // Skip endpoints already occupied by another symbol's inlet —
              // that would place the new symbol on top of the existing one.
              if (isAtSymbolInlet(ex, ey)) continue;
              const d = distance(portAbsX, portAbsY, ex, ey);
              if (d < bestDist) {
                bestDist = d;
                bestPipeId = tp.id;
                bestSnapX = ex;
                bestSnapY = ey;
                bestElX = ex - rot.x;
                bestElY = ey - rot.y;
                snapped = true;
                endpointSnapped = true;
              }
            }
          }

          // Step 2b: Body snap fallback (mid-pipe placement).
          if (!endpointSnapped) {
            for (const port of portsToSnap) {
              const rot = rotateOffset(port.offsetX, port.offsetY, 0);
              const portAbsX = x + rot.x;
              const portAbsY = y + rot.y;
              const { x: sx, y: sy, t } = closestPointOnSegment(
                portAbsX, portAbsY, tp.startX, tp.startY, tp.endX, tp.endY
              );
              const d = distance(portAbsX, portAbsY, sx, sy);
              if (d < bestDist && t > SNAP_T_MIN && t < SNAP_T_MAX) {
                bestDist = d;
                bestPipeId = tp.id;
                bestSnapX = sx;
                bestSnapY = sy;
                bestElX = sx - rot.x;
                bestElY = sy - rot.y;
                snapped = true;
              }
            }
          }
        } else {
          // Elbow, tee, custom: body snap on the selected pipe only.
          for (const port of portsToSnap) {
            const rot = rotateOffset(port.offsetX, port.offsetY, 0);
            const portAbsX = x + rot.x;
            const portAbsY = y + rot.y;
            const { x: sx, y: sy, t } = closestPointOnSegment(
              portAbsX, portAbsY, tp.startX, tp.startY, tp.endX, tp.endY
            );
            const d = distance(portAbsX, portAbsY, sx, sy);
            if (d < bestDist && t > SNAP_T_MIN && t < SNAP_T_MAX) {
              bestDist = d;
              bestPipeId = tp.id;
              bestSnapX = sx;
              bestSnapY = sy;
              bestElX = sx - rot.x;
              bestElY = sy - rot.y;
              snapped = true;
            }
          }
        }
      }

      // Propagate fluid type from the snapped pipe (or its upstream element)
      if (snapped && bestPipeId) {
        const snappedPipe = pipes.find((p) => p.id === bestPipeId);
        if (snappedPipe) {
          const fluid = inferFluidFromPipe(snappedPipe, placedElements);
          if (fluid) el = { ...el, carriesFluid: fluid };
        }
      }

      if (symbolId === 'tee_junction') {
        teeConfirmedRef.current = false;
        setPendingTee({
          element: snapped ? { ...el, x: bestElX, y: bestElY } : el,
          pipeId: bestPipeId,
          snapX: bestSnapX,
          snapY: bestSnapY,
          elX: bestElX,
          elY: bestElY,
          snapped,
        });
        return;
      }

      if (symbolId === 'elbow_bend') {
        setPendingElbow({
          element: snapped ? { ...el, x: bestElX, y: bestElY } : el,
          pipeId: bestPipeId,
          snapX: bestSnapX,
          snapY: bestSnapY,
          elX: bestElX,
          elY: bestElY,
          snapped,
        });
        return;
      }

      if ((FLIP_ONLY_SYMBOL_IDS as readonly string[]).includes(symbolId)) {
        setPendingFlip({
          element: snapped ? { ...el, x: bestElX, y: bestElY } : el,
          pipeId: bestPipeId,
          snapX: bestSnapX,
          snapY: bestSnapY,
          snapped,
        });
        return;
      }

      if (symbolId === 'water_fittings') {
        setPendingWaterFittings({
          element: snapped ? { ...el, x: bestElX, y: bestElY } : el,
          pipeId: bestPipeId,
          snapX: bestSnapX,
          snapY: bestSnapY,
          snapped,
        });
        return;
      }

      if (snapped) {
        const placedEl = { ...el, x: bestElX, y: bestElY };
        if (INLINE_SYMBOL_IDS.has(symbolId)) {
          const { inletPos, outletPos } = getInlinePortPositions(placedEl);
          insertElementOnPipeInline(bestPipeId, placedEl, inletPos, outletPos);
        } else if (TERMINAL_SYMBOL_IDS.has(symbolId)) {
          insertElementOnPipe(bestPipeId, placedEl, bestSnapX, bestSnapY, true);
        } else {
          insertElementOnPipe(bestPipeId, placedEl, bestSnapX, bestSnapY);
        }
      } else {
        addElement(el);
      }
    },
    [addElement, insertElementOnPipe, insertElementOnPipeInline, setPendingTee, setPendingElbow, setPendingFlip, setPendingWaterFittings]
  );

  // Handle drop from symbol palette (desktop drag-drop)
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOverPos(null);
      setDraggingSymbolId(null);
      const symbolId = e.dataTransfer.getData('symbolId');
      const symbolName = e.dataTransfer.getData('symbolName');
      if (!symbolId || !stageRef.current) return;

      const pos = getCanvasPos(e.clientX, e.clientY);
      if (!pos) return;
      placeSymbolAt(pos.x, pos.y, symbolId, symbolName);
    },
    [placeSymbolAt, getCanvasPos, setDraggingSymbolId]
  );

  const handleTeePortConfirm = useCallback(
    (inletIndices: number[], rotation: number) => {
      if (!pendingTee || teeConfirmedRef.current) return;
      teeConfirmedRef.current = true;

      // Use first selected inlet for snap-point positioning
      const primaryInletIndex = inletIndices[0] ?? 0;

      let elX = pendingTee.element.x;
      let elY = pendingTee.element.y;
      if (pendingTee.snapped) {
        const inletPort = (SYMBOL_PORTS['tee_junction'] ?? [])[primaryInletIndex];
        if (inletPort) {
          const rot = rotateOffset(inletPort.offsetX, inletPort.offsetY, rotation);
          elX = pendingTee.snapX - rot.x;
          elY = pendingTee.snapY - rot.y;
        }
      }

      // Store as upstreamPortIndices (array) for 2-inlet mode, or upstreamPortIndex for single
      const portOverride =
        inletIndices.length > 1
          ? { upstreamPortIndices: inletIndices }
          : { upstreamPortIndex: inletIndices[0] };

      const finalEl: CanvasElement = { ...pendingTee.element, x: elX, y: elY, ...portOverride, rotation };
      if (pendingTee.snapped) {
        // terminatePipe=true: incoming pipe ends at the tee inlet; user draws
        // pipes from the outlets — avoids a phantom pipe through the tee body.
        insertElementOnPipe(pendingTee.pipeId, finalEl, pendingTee.snapX, pendingTee.snapY, true);
      } else {
        addElement(finalEl);
      }
      setPendingTee(null);
      teeConfirmedRef.current = false;
    },
    [pendingTee, addElement, insertElementOnPipe]
  );

  const handleElbowPortConfirm = useCallback(
    (upstreamPortIndex: number, rotation: number) => {
      if (!pendingElbow) return;

      // Recalculate element position so the chosen inlet port, after the chosen
      // rotation, lands exactly on the snap point on the pipe.
      let elX = pendingElbow.element.x;
      let elY = pendingElbow.element.y;
      if (pendingElbow.snapped) {
        const inletPort = (SYMBOL_PORTS['elbow_bend'] ?? [])[upstreamPortIndex];
        if (inletPort) {
          const rot = rotateOffset(inletPort.offsetX, inletPort.offsetY, rotation);
          elX = pendingElbow.snapX - rot.x;
          elY = pendingElbow.snapY - rot.y;
        }
      }

      const finalEl: CanvasElement = { ...pendingElbow.element, x: elX, y: elY, upstreamPortIndex, rotation };
      if (pendingElbow.snapped) {
        // terminatePipe=true: elbow changes direction, so don't create a phantom pipe
        // through the elbow body — the incoming pipe ends at the inlet.
        insertElementOnPipe(pendingElbow.pipeId, finalEl, pendingElbow.snapX, pendingElbow.snapY, true);
      } else {
        addElement(finalEl);
      }
      setPendingElbow(null);
    },
    [pendingElbow, addElement, insertElementOnPipe]
  );

  const handleWaterFittingsConfirm = useCallback(
    (fittingTypeId: string, efficiencyRating: 2 | 3) => {
      if (!pendingWaterFittings) return;
      const finalEl: CanvasElement = { ...pendingWaterFittings.element, fittingType: fittingTypeId, efficiencyRating };
      if (pendingWaterFittings.snapped) {
        insertElementOnPipe(pendingWaterFittings.pipeId, finalEl, pendingWaterFittings.snapX, pendingWaterFittings.snapY, true);
      } else {
        addElement(finalEl);
      }
      setPendingWaterFittings(null);
    },
    [pendingWaterFittings, addElement, insertElementOnPipe]
  );

  const handleFlipConfirm = useCallback(
    (rotation: number, scaleX?: number) => {
      if (!pendingFlip) return;
      const finalEl: CanvasElement = { ...pendingFlip.element, rotation, scaleX: scaleX ?? 1 };
      if (pendingFlip.snapped) {
        const { symbolId } = finalEl;
        if (INLINE_SYMBOL_IDS.has(symbolId)) {
          // Recalculate element position so the inlet port (respecting the
          // chosen scaleX) lands exactly on the snap point. Without this,
          // flipping RTL shifts the inlet to the wrong side.
          let elX = finalEl.x;
          let elY = finalEl.y;
          const inletPort = (SYMBOL_PORTS[symbolId] ?? []).find((p) => p.role === 'upstream');
          if (inletPort) {
            const sx = scaleX ?? 1;
            const rot = rotateOffset(inletPort.offsetX * sx, inletPort.offsetY, rotation);
            elX = pendingFlip.snapX - rot.x;
            elY = pendingFlip.snapY - rot.y;
          }
          const correctedEl = { ...finalEl, x: elX, y: elY };
          const { inletPos, outletPos } = getInlinePortPositions(correctedEl);
          insertElementOnPipeInline(pendingFlip.pipeId, correctedEl, inletPos, outletPos);
        } else if (TERMINAL_SYMBOL_IDS.has(symbolId)) {
          // Recalculate element position so the inlet port (respecting the chosen
          // scaleX / rotation) lands exactly on the snap point — same fix as inline symbols.
          let elX = finalEl.x;
          let elY = finalEl.y;
          const inletPort = (SYMBOL_PORTS[symbolId] ?? []).find((p) => p.role === 'upstream');
          if (inletPort) {
            const sx = scaleX ?? 1;
            const rot = rotateOffset(inletPort.offsetX * sx, inletPort.offsetY, rotation);
            elX = pendingFlip.snapX - rot.x;
            elY = pendingFlip.snapY - rot.y;
          }
          const correctedEl = { ...finalEl, x: elX, y: elY };
          insertElementOnPipe(pendingFlip.pipeId, correctedEl, pendingFlip.snapX, pendingFlip.snapY, true);
        } else {
          insertElementOnPipe(pendingFlip.pipeId, finalEl, pendingFlip.snapX, pendingFlip.snapY);
        }
      } else {
        addElement(finalEl);
      }
      setPendingFlip(null);
    },
    [pendingFlip, addElement, insertElementOnPipe, insertElementOnPipeInline]
  );

  const handleStagePointerDown = useCallback(
    (pos: { x: number; y: number }, targetIsStage: boolean) => {
      const { pendingSymbol: ps } = useUiStore.getState();
      if (ps) {
        // Tap-to-place mode: place the armed symbol and clear the pending state
        placeSymbolAt(pos.x, pos.y, ps.id, ps.name);
        setPendingSymbol(null);
        return;
      }

      if (activeTool === 'pipe' || activeTool === 'cold_pipe' || activeTool === 'hot_pipe') {
        handleCanvasClick(pos.x, pos.y);
      } else {
        if (targetIsStage) {
          setSelected(null);
        }
      }
    },
    [activeTool, handleCanvasClick, setSelected, placeSymbolAt, setPendingSymbol]
  );

  // Convert stage pointer (viewport px) → virtual canvas content coords
  const pointerToContent = useCallback(
    (pos: { x: number; y: number }) => ({
      x: (pos.x + stageOffsetX) / stageScale,
      y: (pos.y + stageOffsetY) / stageScale,
    }),
    [stageScale, stageOffsetX, stageOffsetY]
  );

  // Shared rubber band completion — reads from refs so it's safe to call from
  // any event handler without worrying about stale React state closures.
  const completeRubberBand = useCallback(() => {
    const anchor = rubberAnchorRef.current;
    const current = rubberCurrentRef.current;
    console.log('[rubber] completeRubberBand fired — anchor:', anchor, 'current:', current, 'dragged:', rubberDraggedRef.current);
    if (!anchor || !current) return;
    rubberAnchorRef.current = null;
    rubberCurrentRef.current = null;
    setRubberAnchor(null);
    setRubberCurrent(null);
    const rect = {
      x: Math.min(anchor.x, current.x),
      y: Math.min(anchor.y, current.y),
      width: Math.abs(current.x - anchor.x),
      height: Math.abs(current.y - anchor.y),
    };
    console.log('[rubber] rect:', rect, 'dragged:', rubberDraggedRef.current);
    if (rubberDraggedRef.current && rect.width > 5 && rect.height > 5) {
      rubberDraggedRef.current = false;
      const { elements: els } = useCanvasStore.getState();
      const inside = els.filter(
        (el) =>
          el.x >= rect.x && el.x <= rect.x + rect.width &&
          el.y >= rect.y && el.y <= rect.y + rect.height,
      );
      console.log('[rubber] elements inside rect:', inside.map((el) => ({ id: el.id, x: el.x, y: el.y })));
      if (inside.length === 1) {
        setSelected(inside[0].id);
      } else if (inside.length > 1) {
        setSelectedIds(inside.map((el) => el.id));
      }
    } else {
      console.log('[rubber] skipped — dragged=false or rect too small');
      rubberDraggedRef.current = false;
    }
  }, [setSelected, setSelectedIds]);

  // Global window mouseup — fires even when released over scrollbars or outside canvas.
  useEffect(() => {
    window.addEventListener('mouseup', completeRubberBand);
    return () => window.removeEventListener('mouseup', completeRubberBand);
  }, [completeRubberBand]);

  // Start rubber band on mousedown on empty canvas (non-pipe modes only)
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (activeTool === 'pipe' || activeTool === 'cold_pipe' || activeTool === 'hot_pipe') return;
      if (e.target !== e.target.getStage()) return;
      const stage = e.target.getStage();
      if (!stage) return;
      const raw = stage.getPointerPosition();
      if (!raw) return;
      const content = pointerToContent(raw);
      rubberDraggedRef.current = false;
      rubberAnchorRef.current = content;
      rubberCurrentRef.current = content;
      setRubberAnchor(content);
      setRubberCurrent(content);
    },
    [activeTool, pointerToContent],
  );

  // Konva onMouseUp kept as no-op — window listener above handles completion.
  const handleStageMouseUp = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent>) => { /* handled by window mouseup */ },
    [],
  );

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      console.log('[rubber] handleStageClick — rubberDragged:', rubberDraggedRef.current);
      // window.mouseup (completeRubberBand) fires AFTER Konva's onClick, so if
      // rubberDragged is still true here we must NOT reset it — completeRubberBand
      // needs to see it when it runs a moment later.
      if (rubberDraggedRef.current) {
        return;
      }
      const stage = e.target.getStage();
      if (!stage) return;
      const raw = stage.getPointerPosition();
      if (!raw) return;
      handleStagePointerDown(pointerToContent(raw), e.target === stage);
    },
    [handleStagePointerDown, pointerToContent],
  );

  const handleStageTap = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const raw = stage.getPointerPosition();
      if (!raw) return;
      handleStagePointerDown(pointerToContent(raw), e.target === stage);
    },
    [handleStagePointerDown, pointerToContent]
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const raw = stage.getPointerPosition();
      if (!raw) return;
      const content = pointerToContent(raw);
      handleCanvasMouseMove(content.x, content.y);
      // Update rubber band while dragging (use ref — state update may lag)
      if (rubberAnchorRef.current) {
        const dx = content.x - rubberAnchorRef.current.x;
        const dy = content.y - rubberAnchorRef.current.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) rubberDraggedRef.current = true;
        rubberCurrentRef.current = content;
        setRubberCurrent(content);
      }
    },
    [handleCanvasMouseMove, pointerToContent, rubberAnchor],
  );

  // Scrollbar geometry
  const thumbHeight = Math.max(24, (canvasSize.height / (virtualHeight * stageScale)) * canvasSize.height);
  const thumbTop = maxOffset > 0 ? (stageOffsetY / maxOffset) * (canvasSize.height - thumbHeight) : 0;

  const handleThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const capturedOffset = stageOffsetY;
    const capturedMax = maxOffset;
    const capturedThumbH = Math.max(24, (canvasSize.height / (virtualHeight * stageScale)) * canvasSize.height);
    const trackH = canvasSize.height - capturedThumbH;
    scrollbarDragRef.current = { startY: e.clientY, startOffset: capturedOffset };
    const onMove = (me: MouseEvent) => {
      if (!scrollbarDragRef.current) return;
      const delta = me.clientY - scrollbarDragRef.current.startY;
      const newOffset = scrollbarDragRef.current.startOffset + (trackH > 0 ? (delta / trackH) * capturedMax : 0);
      setStageOffsetY(Math.max(0, Math.min(newOffset, capturedMax)));
    };
    const onUp = () => {
      scrollbarDragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [stageOffsetY, maxOffset, canvasSize.height, virtualHeight, stageScale]);

  const handleHorizontalThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const capturedOffset = stageOffsetX;
    const capturedMax = maxOffsetX;
    const capturedThumbW = horizontalThumbWidth;
    const trackW = canvasSize.width - 12 - capturedThumbW;

    horizontalScrollbarDragRef.current = {
      startX: e.clientX,
      startOffset: capturedOffset,
    };

    const onMove = (me: MouseEvent) => {
      if (!horizontalScrollbarDragRef.current) return;

      const delta = me.clientX - horizontalScrollbarDragRef.current.startX;

      const newOffset =
        horizontalScrollbarDragRef.current.startOffset +
        (trackW > 0 ? (delta / trackW) * capturedMax : 0);

      setStageOffsetX(Math.max(0, Math.min(newOffset, capturedMax)));
    };

    const onUp = () => {
      horizontalScrollbarDragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [
    stageOffsetX,
    maxOffsetX,
    horizontalThumbWidth,
    canvasSize.width,
  ]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', cursor: getCursor(), position: 'relative' }}
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        if (draggingSymbolId) {
          const pos = getCanvasPos(e.clientX, e.clientY);
          if (pos) setDragOverPos(pos);
        }
      }}
      onDragLeave={() => setDragOverPos(null)}
    >
      {pendingSymbol && (
        <div style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          background: '#fef3c7',
          border: '1.5px solid #f59e0b',
          borderRadius: 8,
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 13,
          fontWeight: 600,
          color: '#92400e',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}>
          Tap canvas to place: {pendingSymbol.name}
          <button
            onClick={() => setPendingSymbol(null)}
            style={{
              pointerEvents: 'auto',
              marginLeft: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              color: '#92400e',
              padding: '0 2px',
            }}
            aria-label="Cancel placement"
          >
            ×
          </button>
        </div>
      )}
      <Stage
        ref={stageRef}
        width={canvasSize.width}
        height={canvasSize.height}
        x={-stageOffsetX}
        y={-stageOffsetY}
        scaleX={stageScale}
        scaleY={stageScale}
        onClick={handleStageClick}
        onTap={handleStageTap}
        onMouseDown={handleStageMouseDown}
        onMouseUp={handleStageMouseUp}
        onMouseMove={handleStageMouseMove}
        style={{ background: '#fff', cursor: pendingSymbol ? 'crosshair' : undefined }}
      >
        {pdfBackground && (
          <PdfBackgroundLayer
            dataUrl={pdfBackground.dataUrl}
            x={pdfBackground.x}
            y={pdfBackground.y}
            width={pdfBackground.width}
            height={pdfBackground.height}
            opacity={0.38}
            rotation={pdfBackground.rotation}
            locked={pdfBackground.locked}
            onChange={updatePdfBackground}
          />
        )}
        <GridLayer
          canvasWidth={virtualWidth}
          canvasHeight={virtualHeight}
          upperMrl={mrlConfig.upperMrl}
          lowerMrl={mrlConfig.lowerMrl}
          axisWidth={AXIS_WIDTH}
          floorLevels={floorLevels}
        />
        <ElementsLayer
          dragPreview={draggingSymbolId && dragOverPos
            ? { symbolId: draggingSymbolId, x: dragOverPos.x, y: dragOverPos.y }
            : null}
          onElementClick={handleElementClick}
          rubberBand={rubberBandRect}
        />
        <PipeDraftLayer
          anchorPoint={anchorPoint}
          previewEnd={previewEnd}
          isActive={isDrawingPipe}
          activeTool={activeTool}
        />
      </Stage>
      {/* Custom vertical scrollbar */}
      {maxOffset > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: 12,
            height: canvasSize.height,
            background: '#e8e8e8',
            zIndex: 20,
            cursor: 'pointer',
            borderLeft: '1px solid #ccc',
          }}
          onMouseDown={(e) => {
            // Click on track scrolls to that proportion
            const rect = e.currentTarget.getBoundingClientRect();
            const clickY = e.clientY - rect.top;
            const newOffset = (clickY / canvasSize.height) * maxOffset;
            setStageOffsetY(Math.max(0, Math.min(newOffset, maxOffset)));
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: 1,
              width: 10,
              height: thumbHeight,
              top: thumbTop,
              background: '#aaa',
              borderRadius: 5,
              cursor: 'grab',
            }}
            onMouseDown={handleThumbMouseDown}
          />
        </div>
      )}

      {/* Horizontal scrollbar */}
      {maxOffsetX > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 12,
            bottom: 0,
            height: 12,
            background: '#f6f3f3',
            borderTop: '1px solid #e5e7eb',
            zIndex: 20,
          }}
          onMouseDown={(e) => {
            // Click on track scrolls to that proportion
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const newOffset = (clickX / canvasSize.width) * maxOffsetX;
            setStageOffsetX(Math.max(0, Math.min(newOffset, maxOffsetX)));
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: horizontalThumbLeft,
              top: 2,
              height: 8,
              width: horizontalThumbWidth,
              borderRadius: 5,
              background: '#aaa',
              cursor: 'grab',
            }}
            onMouseDown={handleHorizontalThumbMouseDown}
          />
        </div>
      )}

      {/* Zoom controls — bottom right */}
      <div style={{
        position: 'absolute',
        bottom: 56,
        right: maxOffset > 0 ? 20 : 8,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        zIndex: 20,
      }}>
        <button
          onClick={() => zoom(-SCALE_STEP)}
          title="Zoom out"
          style={{
            width: 32, height: 32,
            border: '1px solid #bbb',
            borderRadius: 4,
            background: '#fff',
            fontSize: 20,
            lineHeight: 1,
            cursor: 'pointer',
            color: '#333',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >-</button>
        <div style={{
          fontSize: 10,
          color: '#666',
          userSelect: 'none',
          background: 'rgba(255,255,255,0.85)',
          borderRadius: 3,
          padding: '3px 6px',
          border: '1px solid #ddd',
          minWidth: 36,
          textAlign: 'center',
        }}>
          {Math.round(stageScale * 100)}%
        </div>
        <button
          onClick={() => zoom(SCALE_STEP)}
          title="Zoom in"
          style={{
            width: 32, height: 32,
            border: '1px solid #bbb',
            borderRadius: 4,
            background: '#fff',
            fontSize: 20,
            lineHeight: 1,
            cursor: 'pointer',
            color: '#333',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >+</button>
      </div>

      {selectedRotatable && (() => {
        const vp = contentToViewport(selectedRotatable.x, selectedRotatable.y);
        return (
          <RotationPanel
            elementId={selectedRotatable.id}
            symbolId={selectedRotatable.symbolId}
            x={vp.x}
            y={vp.y}
            currentRotation={selectedRotatable.rotation}
            currentScaleX={selectedRotatable.scaleX ?? 1}
          />
        );
      })()}
      {pendingTee && (
        <TeeJunctionPortDialog
          onConfirm={handleTeePortConfirm}
          onCancel={() => setPendingTee(null)}
        />
      )}
      {pendingElbow && (
        <ElbowBendPortDialog
          imageUrl={symbolsApi.getImageUrl('elbow_bend')}
          onConfirm={handleElbowPortConfirm}
          onCancel={() => setPendingElbow(null)}
        />
      )}
      {pendingFlip && (
        <FlipOrientationDialog
          symbolId={pendingFlip.element.symbolId}
          symbolName={pendingFlip.element.symbolName}
          onConfirm={handleFlipConfirm}
          onCancel={() => setPendingFlip(null)}
        />
      )}
      {pendingWaterFittings && (
        <WaterFittingsDialog
          onConfirm={handleWaterFittingsConfirm}
          onCancel={() => setPendingWaterFittings(null)}
        />
      )}
      {selectedFitting && (() => {
        const vp = contentToViewport(selectedFitting.x, selectedFitting.y);
        return (
          <FittingTypePanel
            elementId={selectedFitting.id}
            x={vp.x}
            y={vp.y}
            currentFittingTypeId={selectedFitting.fittingType ?? 'shower_tap'}
            currentEfficiencyRating={selectedFitting.efficiencyRating}
          />
        );
      })()}
      {selectedLongBath && (() => {
        const vp = contentToViewport(selectedLongBath.x, selectedLongBath.y);
        return (
          <LongBathPanel
            elementId={selectedLongBath.id}
            x={vp.x}
            y={vp.y}
            currentCapacityL={selectedLongBath.longBathCapacityL}
          />
        );
      })()}
      {pendingChain && (
        <PipePropertiesModal
          pipeId={pendingChain.pipeId}
          onConfirm={confirmPipe}
          onDiscard={discardPipe}
        />
      )}
      {tankModalId && (
        <WaterTankPropertiesModal
          tankId={tankModalId}
          onClose={() => setTankModalId(null)}
        />
      )}
    </div>
  );
}
