import { useState, useCallback, useEffect } from 'react';
import { useUiStore } from '../store/uiStore';
import { useCanvasStore } from '../store/canvasStore';
import { PipeElement, PipeType } from '../types';
import { findNearestPort } from '../utils/symbolPorts';

export interface PendingChain {
  pipeId: string;
  endPoint: { x: number; y: number };
}

const PORT_SNAP_THRESHOLD = 16; // px — user clicks near a port dot to connect

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
  const removePipe = useCanvasStore((s) => s.removePipe);
  const setSelected = useCanvasStore((s) => s.setSelected);

  const [drawState, setDrawState] = useState<PipeDrawState>('idle');
  const [anchorPoint, setAnchorPoint] = useState<{ x: number; y: number } | null>(null);
  const [previewEnd, setPreviewEnd] = useState<{ x: number; y: number } | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [pendingChain, setPendingChain] = useState<PendingChain | null>(null);

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

      // Snap to a port if the click is close enough
      const elements = useCanvasStore.getState().elements;
      const nearPort = findNearestPort(rawX, rawY, elements, PORT_SNAP_THRESHOLD);
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
        // Pause chaining — wait for the user to fill pipe properties
        setPendingChain({ pipeId: pipe.id, endPoint: end });
        setDrawState('waiting_first'); // freeze drawing until modal is resolved
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

  /** User confirmed pipe properties — resume chaining from the end point. */
  const confirmPipe = useCallback(() => {
    if (!pendingChain) return;
    const { endPoint } = pendingChain;
    setPendingChain(null);
    setSelected(null);
    setAnchorPoint(endPoint);
    setPreviewEnd(endPoint);
    setDrawState('waiting_second');
  }, [pendingChain, setSelected]);

  /** User discarded the pipe — delete it and reset to start of a new pipe. */
  const discardPipe = useCallback(() => {
    if (!pendingChain) return;
    removePipe(pendingChain.pipeId);
    setPendingChain(null);
    setSelected(null);
    setAnchorPoint(null);
    setPreviewEnd(null);
    setDrawState('waiting_first');
  }, [pendingChain, removePipe, setSelected]);

  return {
    isDrawingPipe: isPipeTool,
    drawState,
    anchorPoint,
    previewEnd,
    pendingChain,
    confirmPipe,
    discardPipe,
    handleCanvasClick,
    handleCanvasMouseMove,
  };
}
