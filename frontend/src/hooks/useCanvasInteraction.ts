import { useState, useCallback, useEffect } from 'react';
import { useUiStore } from '../store/uiStore';
import { useCanvasStore } from '../store/canvasStore';
import { PipeElement, PipeType, isBackflowRiskElement } from '../types';
import { findNearestPort } from '../utils/symbolPorts';

const PORT_SNAP_THRESHOLD = 4; // px — user clicks near a port dot to connect

type PipeDrawState = 'idle' | 'waiting_first' | 'waiting_second';

function activeToPipeType(activeTool: string): PipeType {
  if (activeTool === 'cold_pipe') return 'cold';
  if (activeTool === 'hot_pipe') return 'hot';
  return 'generic';
}

function snapToAxis(
  x: number,
  y: number,
  anchorX: number,
  anchorY: number
): { x: number; y: number } {
  const dx = Math.abs(x - anchorX);
  const dy = Math.abs(y - anchorY);
  return dx >= dy ? { x, y: anchorY } : { x: anchorX, y };
}

export function useCanvasInteraction() {
  const activeTool = useUiStore((s) => s.activeTool);
  const setActiveTool = useUiStore((s) => s.setActiveTool);
  const addPipe = useCanvasStore((s) => s.addPipe);
  const setSelected = useCanvasStore((s) => s.setSelected);

  const [drawState, setDrawState] = useState<PipeDrawState>('idle');
  const [anchorPoint, setAnchorPoint] = useState<{ x: number; y: number } | null>(null);
  const [previewEnd, setPreviewEnd] = useState<{ x: number; y: number } | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);

  const isPipeTool =
    activeTool === 'pipe' || activeTool === 'cold_pipe' || activeTool === 'hot_pipe';
  const isColdOrHot = activeTool === 'cold_pipe' || activeTool === 'hot_pipe';

  // Track Shift key for generic pipe H/V snap
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => setShiftHeld(e.shiftKey);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  // Reset state when switching away from pipe tools
  useEffect(() => {
    if (!isPipeTool) {
      setDrawState('idle');
      setAnchorPoint(null);
      setPreviewEnd(null);
    } else {
      setDrawState('waiting_first');
    }
  }, [activeTool, isPipeTool]);

  // Escape cancels pipe drawing
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPipeTool) {
        setActiveTool('select');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isPipeTool, setActiveTool]);

  const applyConstraint = useCallback(
    (x: number, y: number): { x: number; y: number } => {
      if (!anchorPoint) return { x, y };
      // Cold/hot pipes always H/V; generic pipe only when Shift is held
      if (isColdOrHot || shiftHeld) {
        return snapToAxis(x, y, anchorPoint.x, anchorPoint.y);
      }
      return { x, y };
    },
    [anchorPoint, isColdOrHot, shiftHeld]
  );

  const handleCanvasClick = useCallback(
    (rawX: number, rawY: number) => {
      if (!isPipeTool) return;

      // Snap to a port if the click is close enough.
      // For typed pipes, prefer the matching-label port within a larger radius
      // so drawing a cold pipe near a dual-supply fixture always lands on Cold.
      const elements = useCanvasStore.getState().elements;
      const pipeType = activeToPipeType(activeTool);
      const preferLabel = pipeType === 'cold' ? 'Cold' : pipeType === 'hot' ? 'Hot' : undefined;
      const nearPort = findNearestPort(rawX, rawY, elements, PORT_SNAP_THRESHOLD, preferLabel);
      const x = nearPort ? nearPort.x : rawX;
      const y = nearPort ? nearPort.y : rawY;

      if (drawState === 'waiting_first') {
        setAnchorPoint({ x, y });
        setPreviewEnd({ x, y });
        setDrawState('waiting_second');
      } else if (drawState === 'waiting_second' && anchorPoint) {
        // If the click snapped to a port, use the exact port position (skip H/V constraint).
        // Applying applyConstraint after a port snap moves the endpoint off the port dot,
        // causing the connection status indicator to show ✗ instead of ✓.
        const end = nearPort ? { x, y } : applyConstraint(x, y);
        const pipe: PipeElement = {
          id: crypto.randomUUID(),
          pipeType: activeToPipeType(activeTool),
          startX: anchorPoint.x,
          startY: anchorPoint.y,
          endX: end.x,
          endY: end.y,
        };
        addPipe(pipe);
        setSelected(pipe.id);

        // Offer DCV insertion if the pipe endpoint snapped to a backflow-risk element's upstream port
        if (nearPort && nearPort.role === 'upstream') {
          const snappedEl = elements.find((e) => e.id === nearPort.elementId);
          if (snappedEl && isBackflowRiskElement(snappedEl)) {
            useUiStore.getState().showDcvToast(snappedEl.id, snappedEl.x, snappedEl.y);
          }
        }

        // Resume chaining immediately from the end point
        setAnchorPoint(end);
        setPreviewEnd(end);
        setDrawState('waiting_second');
      }
    },
    [isPipeTool, drawState, anchorPoint, applyConstraint, addPipe, activeTool]
  );

  const handleCanvasMouseMove = useCallback(
    (x: number, y: number) => {
      if (drawState === 'waiting_second') {
        setPreviewEnd(applyConstraint(x, y));
      }
    },
    [drawState, applyConstraint]
  );

  return {
    isDrawingPipe: isPipeTool,
    drawState,
    anchorPoint,
    previewEnd,
    handleCanvasClick,
    handleCanvasMouseMove,
  };
}
