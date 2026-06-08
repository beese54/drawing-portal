import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AnnotationElement, CanvasElement, PipeElement, TankProperties, AXIS_WIDTH } from '../types';
import { SYMBOL_PORTS, getElementPorts, rotateOffset } from '../utils/symbolPorts';

interface Clipboard {
  elements: CanvasElement[];
  pipes: PipeElement[];
}

interface HistoryEntry {
  elements: CanvasElement[];
  pipes: PipeElement[];
  annotations: AnnotationElement[];
}

const MAX_HISTORY = 50;

interface CanvasStore {
  elements: CanvasElement[];
  pipes: PipeElement[];
  annotations: AnnotationElement[];
  selectedId: string | null;
  selectedIds: string[];            // selected element IDs (multi-select)
  selectedPipeIds: string[];        // selected pipe IDs (multi-select)
  selectedAnnotationIds: string[];  // selected annotation IDs (multi-select)
  sourcePressureBar: number | null;
  clipboard: Clipboard | null;
  history: HistoryEntry[];
  future: HistoryEntry[];

  // Selection
  setSelected: (id: string | null) => void;
  setSelectedIds: (ids: string[]) => void;
  setMultiSelection: (elementIds: string[], pipeIds: string[], annotationIds?: string[]) => void;

  // Canvas mutations
  addElement: (el: CanvasElement) => void;
  loadTemplate: (elements: CanvasElement[], pipes: PipeElement[]) => void;
  appendTemplate: (elements: CanvasElement[], pipes: PipeElement[]) => void;
  updateElementPosition: (id: string, x: number, y: number) => void;
  moveElement: (id: string, newX: number, newY: number, oldPorts: { x: number; y: number }[], newPorts: { x: number; y: number }[]) => void;
  moveMultiple: (elementIds: string[], dx: number, dy: number, pipeIds?: string[], annotationIds?: string[]) => void;
  updateElementRotation: (id: string, rotation: number) => void;
  updateElementScaleX: (id: string, scaleX: number) => void;
  updateFittingType: (id: string, fittingType: string) => void;
  updateEfficiencyRating: (id: string, rating: 2 | 3) => void;
  updateLongBathCapacity: (id: string, capacityL: number) => void;
  addPipe: (pipe: PipeElement) => void;
  updatePipeEndpoints: (id: string, startX: number, startY: number, endX: number, endY: number) => void;
  insertElementOnPipe: (pipeId: string, element: CanvasElement, snapX: number, snapY: number, terminatePipe?: boolean) => void;
  insertElementOnPipeInline: (pipeId: string, element: CanvasElement, inletPos: { x: number; y: number }, outletPos: { x: number; y: number }) => void;
  removeElement: (id: string) => void;
  removePipe: (id: string) => void;
  clearCanvas: () => void;
  updateTankProperties: (id: string, props: Partial<TankProperties>) => void;
  updateElementDimensions: (id: string, width: number, height: number) => void;
  updateCarriesFluid: (id: string, fluid: 'cold' | 'hot' | undefined) => void;
  setSourcePressure: (bar: number | null) => void;

  // Annotations
  addAnnotation: (ann: AnnotationElement) => void;
  moveAnnotation: (id: string, x: number, y: number) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, text: string) => void;

  // Scale change — resize all content proportionally, anchored to canvas bottom (lowerMRL)
  rescaleAll: (oldScale: number, newScale: number, virtualHeight: number) => void;

  // Copy-paste
  copySelection: () => void;
  pasteClipboard: (target?: { x: number; y: number }) => void;
  setDualSupply: (id: string, enabled: boolean) => void;
  setSwapDualSupply: (id: string, swapped: boolean) => void;

  // Undo-redo
  undo: () => void;
  redo: () => void;
}

export const useCanvasStore = create<CanvasStore>()(persist((set, get) => {
  // Save current elements+pipes+annotations to history before a mutation.
  const pushHistory = () => {
    const { elements, pipes, annotations, history } = get();
    set({
      history: [...history.slice(-(MAX_HISTORY - 1)), { elements, pipes, annotations }],
      future: [],
    });
  };

  return {
    elements: [],
    pipes: [],
    annotations: [],
    selectedId: null,
    selectedIds: [],
    selectedPipeIds: [],
    selectedAnnotationIds: [],
    sourcePressureBar: null,
    clipboard: null,
    history: [],
    future: [],

    // ── Selection ────────────────────────────────────────────────────────────

    setSelected: (id) =>
      set({ selectedId: id, selectedIds: [], selectedPipeIds: [], selectedAnnotationIds: [] }),

    setSelectedIds: (ids) =>
      set({ selectedIds: ids, selectedId: null, selectedPipeIds: [], selectedAnnotationIds: [] }),

    // Atomically set element, pipe, and annotation selections (used by rubber band).
    setMultiSelection: (elementIds, pipeIds, annotationIds = []) =>
      set({ selectedIds: elementIds, selectedPipeIds: pipeIds, selectedAnnotationIds: annotationIds, selectedId: null }),

    // ── Canvas mutations ─────────────────────────────────────────────────────

    addElement: (el) => {
      pushHistory();
      set((state) => ({ elements: [...state.elements, el] }));
    },

    loadTemplate: (elements, pipes) => {
      pushHistory();
      set({ elements, pipes, selectedId: null, selectedIds: [], selectedPipeIds: [] });
    },

    appendTemplate: (elements, pipes) => {
      pushHistory();
      set((state) => ({
        elements: [...state.elements, ...elements],
        pipes: [...state.pipes, ...pipes],
        selectedId: null,
        selectedIds: [],
        selectedPipeIds: [],
      }));
    },

    updateElementPosition: (id, x, y) =>
      set((state) => ({
        elements: state.elements.map((el) => el.id === id ? { ...el, x, y } : el),
      })),

    moveElement: (id, newX, newY, oldPorts, newPorts) => {
      pushHistory();
      set((state) => {
        const MATCH = 2;
        const updatedPipes = state.pipes.map((pipe) => {
          let { startX, startY, endX, endY } = pipe;
          for (let i = 0; i < oldPorts.length; i++) {
            const op = oldPorts[i];
            const np = newPorts[i];
            if (Math.hypot(startX - op.x, startY - op.y) < MATCH) { startX = np.x; startY = np.y; }
            if (Math.hypot(endX - op.x, endY - op.y) < MATCH)     { endX = np.x;   endY = np.y;   }
          }
          return { ...pipe, startX, startY, endX, endY };
        });
        return {
          elements: state.elements.map((el) => el.id === id ? { ...el, x: newX, y: newY } : el),
          pipes: updatedPipes,
        };
      });
    },

    moveMultiple: (elementIds, dx, dy, pipeIds = [], annotationIds = []) => {
      pushHistory();
      set((state) => {
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return {};
        const idSet = new Set(elementIds);
        const pipeIdSet = new Set(pipeIds);
        const annIdSet = new Set(annotationIds);
        const selectedEls = state.elements.filter((e) => idSet.has(e.id));
        const MATCH = 3;

        const oldPorts: { x: number; y: number }[] = [];
        for (const el of selectedEls) {
          const ports = SYMBOL_PORTS[el.symbolId] ?? [];
          for (const port of ports) {
            const rot = rotateOffset(port.offsetX * (el.scaleX ?? 1), port.offsetY, el.rotation);
            oldPorts.push({ x: el.x + rot.x, y: el.y + rot.y });
          }
        }

        const newElements = state.elements.map((el) =>
          idSet.has(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el
        );

        const newPipes = state.pipes.map((pipe) => {
          if (pipeIdSet.has(pipe.id)) {
            return { ...pipe, startX: pipe.startX + dx, startY: pipe.startY + dy, endX: pipe.endX + dx, endY: pipe.endY + dy };
          }
          let { startX, startY, endX, endY } = pipe;
          let startMoved = false;
          let endMoved = false;
          for (const op of oldPorts) {
            if (!startMoved && Math.hypot(startX - op.x, startY - op.y) < MATCH) { startX += dx; startY += dy; startMoved = true; }
            if (!endMoved  && Math.hypot(endX   - op.x, endY   - op.y) < MATCH) { endX   += dx; endY   += dy; endMoved   = true; }
            if (startMoved && endMoved) break;
          }
          return { ...pipe, startX, startY, endX, endY };
        });

        const newAnnotations = state.annotations.map((a) =>
          annIdSet.has(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a
        );

        return { elements: newElements, pipes: newPipes, annotations: newAnnotations };
      });
    },

    updateElementRotation: (id, rotation) => {
      pushHistory();
      set((state) => ({
        elements: state.elements.map((e) => e.id === id ? { ...e, rotation } : e),
      }));
    },

    updateElementScaleX: (id, scaleX) => {
      pushHistory();
      set((state) => {
        const el = state.elements.find((e) => e.id === id);
        if (!el) return {};
        const ports = getElementPorts(el);
        const MATCH = 2;
        const oldPorts = ports.map((port) => { const rot = rotateOffset(port.offsetX * (el.scaleX ?? 1), port.offsetY, el.rotation); return { x: el.x + rot.x, y: el.y + rot.y }; });
        const newPorts = ports.map((port) => { const rot = rotateOffset(port.offsetX * scaleX,            port.offsetY, el.rotation); return { x: el.x + rot.x, y: el.y + rot.y }; });
        const updatedPipes = state.pipes.map((pipe) => {
          let { startX, startY, endX, endY } = pipe;
          for (let i = 0; i < oldPorts.length; i++) {
            const op = oldPorts[i]; const np = newPorts[i];
            if (Math.hypot(startX - op.x, startY - op.y) < MATCH) { startX = np.x; startY = np.y; }
            if (Math.hypot(endX   - op.x, endY   - op.y) < MATCH) { endX   = np.x; endY   = np.y; }
          }
          return { ...pipe, startX, startY, endX, endY };
        });
        return { elements: state.elements.map((e) => e.id === id ? { ...e, scaleX } : e), pipes: updatedPipes };
      });
    },

    updateFittingType: (id, fittingType) => {
      pushHistory();
      set((state) => ({ elements: state.elements.map((el) => el.id === id ? { ...el, fittingType } : el) }));
    },

    updateEfficiencyRating: (id, efficiencyRating) => {
      pushHistory();
      set((state) => ({ elements: state.elements.map((el) => el.id === id ? { ...el, efficiencyRating } : el) }));
    },

    updateLongBathCapacity: (id, longBathCapacityL) => {
      pushHistory();
      set((state) => ({ elements: state.elements.map((el) => el.id === id ? { ...el, longBathCapacityL } : el) }));
    },

    addPipe: (pipe) => {
      pushHistory();
      set((state) => ({ pipes: [...state.pipes, pipe] }));
    },

    updatePipeEndpoints: (id, startX, startY, endX, endY) =>
      set((state) => ({
        pipes: state.pipes.map((p) => p.id === id ? { ...p, startX, startY, endX, endY } : p),
      })),

    insertElementOnPipe: (pipeId, element, snapX, snapY, terminatePipe = false) => {
      pushHistory();
      set((state) => {
        const orig = state.pipes.find((p) => p.id === pipeId);
        if (!orig) return { elements: [...state.elements, element] };
        const pipeA: PipeElement = { id: crypto.randomUUID(), pipeType: orig.pipeType, startX: orig.startX, startY: orig.startY, endX: snapX, endY: snapY };
        const newPipes = terminatePipe
          ? [...state.pipes.filter((p) => p.id !== pipeId), pipeA]
          : [...state.pipes.filter((p) => p.id !== pipeId), pipeA, { id: crypto.randomUUID(), pipeType: orig.pipeType, startX: snapX, startY: snapY, endX: orig.endX, endY: orig.endY } as PipeElement];
        return { elements: [...state.elements, element], pipes: newPipes };
      });
    },

    insertElementOnPipeInline: (pipeId, element, inletPos, outletPos) => {
      pushHistory();
      set((state) => {
        const orig = state.pipes.find((p) => p.id === pipeId);
        if (!orig) return { elements: [...state.elements, element] };
        const origDx = orig.endX - orig.startX;
        const origDy = orig.endY - orig.startY;
        const newPipes: PipeElement[] = state.pipes.filter((p) => p.id !== pipeId);
        const pipeALen = Math.hypot(inletPos.x - orig.startX, inletPos.y - orig.startY);
        if (pipeALen > 1) newPipes.push({ id: crypto.randomUUID(), pipeType: orig.pipeType, startX: orig.startX, startY: orig.startY, endX: inletPos.x, endY: inletPos.y });
        const pipeBdx = orig.endX - outletPos.x;
        const pipeBdy = orig.endY - outletPos.y;
        const pipeBLen = Math.hypot(pipeBdx, pipeBdy);
        const sameDir = pipeBdx * origDx + pipeBdy * origDy >= 0;
        if (pipeBLen > 1 && sameDir) newPipes.push({ id: crypto.randomUUID(), pipeType: orig.pipeType, startX: outletPos.x, startY: outletPos.y, endX: orig.endX, endY: orig.endY });
        return { elements: [...state.elements, element], pipes: newPipes };
      });
    },

    removeElement: (id) => {
      pushHistory();
      set((state) => ({
        elements: state.elements.filter((el) => el.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
        selectedIds: state.selectedIds.filter((sid) => sid !== id),
        selectedPipeIds: state.selectedPipeIds,
      }));
    },

    removePipe: (id) => {
      pushHistory();
      set((state) => ({
        pipes: state.pipes.filter((p) => p.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
        selectedIds: state.selectedIds.filter((sid) => sid !== id),
        selectedPipeIds: state.selectedPipeIds.filter((sid) => sid !== id),
      }));
    },

    clearCanvas: () => {
      pushHistory();
      set({ elements: [], pipes: [], annotations: [], selectedId: null, selectedIds: [], selectedPipeIds: [], selectedAnnotationIds: [] });
    },

    updateTankProperties: (id, props) => {
      pushHistory();
      set((state) => ({
        elements: state.elements.map((el) =>
          el.id === id ? { ...el, tankProperties: { ...(el.tankProperties ?? {}), ...props } } : el
        ),
      }));
    },

    updateElementDimensions: (id, width, height) => {
      pushHistory();
      set((state) => ({
        elements: state.elements.map((el) =>
          el.id === id ? { ...el, width, height } : el
        ),
      }));
    },

    updateCarriesFluid: (id, fluid) =>
      set((state) => ({
        elements: state.elements.map((el) => el.id === id ? { ...el, carriesFluid: fluid } : el),
      })),

    setSourcePressure: (bar) =>
      set({ sourcePressureBar: bar }),

    addAnnotation: (ann) => {
      pushHistory();
      set((state) => ({ annotations: [...state.annotations, ann] }));
    },

    moveAnnotation: (id, x, y) =>
      set((state) => ({
        annotations: state.annotations.map((a) => a.id === id ? { ...a, x, y } : a),
      })),

    updateAnnotation: (id, text) =>
      set((state) => ({
        annotations: state.annotations.map((a) => a.id === id ? { ...a, text } : a),
      })),

    removeAnnotation: (id) => {
      pushHistory();
      set((state) => ({
        annotations: state.annotations.filter((a) => a.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
      }));
    },

    rescaleAll: (oldScale, newScale, virtualHeight) => {
      const { elements, pipes } = get();
      if (elements.length === 0 && pipes.length === 0) return;
      // factor < 1 when scale increases (1:100→1:200): content compresses
      const factor = oldScale / newScale;
      pushHistory();
      set((state) => ({
        elements: state.elements.map((el) => ({
          ...el,
          x: AXIS_WIDTH + (el.x - AXIS_WIDTH) * factor,
          // anchor y at canvas bottom (= lowerMRL) so elevations are preserved
          y: virtualHeight - (virtualHeight - el.y) * factor,
          // width/height are fixed paper-size — not scaled with drawing scale
        })),
        pipes: state.pipes.map((p) => ({
          ...p,
          startX: AXIS_WIDTH + (p.startX - AXIS_WIDTH) * factor,
          startY: virtualHeight - (virtualHeight - p.startY) * factor,
          endX:   AXIS_WIDTH + (p.endX   - AXIS_WIDTH) * factor,
          endY:   virtualHeight - (virtualHeight - p.endY)   * factor,
        })),
      }));
    },

    // ── Copy-paste ───────────────────────────────────────────────────────────

    copySelection: () => {
      const state = get();
      const elementIds = state.selectedIds.length > 0
        ? new Set(state.selectedIds)
        : state.selectedId ? new Set([state.selectedId]) : new Set<string>();

      const selectedEls = state.elements.filter((el) => elementIds.has(el.id));

      // Pipes: include explicitly selected pipe IDs, plus any between selected elements
      const explicitPipeIds = new Set(state.selectedPipeIds);
      const MATCH = 8;
      const selectedPortPositions: { x: number; y: number }[] = [];
      for (const el of selectedEls) {
        const ports = SYMBOL_PORTS[el.symbolId] ?? [];
        for (const port of ports) {
          const rot = rotateOffset(port.offsetX * (el.scaleX ?? 1), port.offsetY, el.rotation);
          selectedPortPositions.push({ x: el.x + rot.x, y: el.y + rot.y });
        }
      }
      const isNearSelectedPort = (x: number, y: number) =>
        selectedPortPositions.some((p) => Math.hypot(p.x - x, p.y - y) < MATCH);

      const selectedPipes = state.pipes.filter((pipe) =>
        explicitPipeIds.has(pipe.id) ||
        (isNearSelectedPort(pipe.startX, pipe.startY) && isNearSelectedPort(pipe.endX, pipe.endY))
      );

      if (selectedEls.length === 0 && selectedPipes.length === 0) return;
      set({ clipboard: { elements: selectedEls, pipes: selectedPipes } });
    },

    pasteClipboard: (target?: { x: number; y: number }) => {
      const state = get();
      if (!state.clipboard || (state.clipboard.elements.length === 0 && state.clipboard.pipes.length === 0)) return;
      pushHistory();

      let dx = 40;
      let dy = 40;
      if (target && (state.clipboard.elements.length > 0 || state.clipboard.pipes.length > 0)) {
        // Compute bounding-box center of the clipboard group
        const xs: number[] = [];
        const ys: number[] = [];
        for (const el of state.clipboard.elements) { xs.push(el.x); ys.push(el.y); }
        for (const p of state.clipboard.pipes) {
          xs.push(p.startX, p.endX);
          ys.push(p.startY, p.endY);
        }
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        dx = target.x - cx;
        dy = target.y - cy;
      }

      const newElements: CanvasElement[] = state.clipboard.elements.map((el) => ({ ...el, id: crypto.randomUUID(), x: el.x + dx, y: el.y + dy }));
      const newPipes: PipeElement[] = state.clipboard.pipes.map((pipe) => ({ ...pipe, id: crypto.randomUUID(), startX: pipe.startX + dx, startY: pipe.startY + dy, endX: pipe.endX + dx, endY: pipe.endY + dy }));
      set({
        elements: [...state.elements, ...newElements],
        pipes: [...state.pipes, ...newPipes],
        selectedIds: newElements.map((el) => el.id),
        selectedPipeIds: newPipes.map((p) => p.id),
        selectedId: null,
      });
    },

    setDualSupply: (id, enabled) => {
      pushHistory();
      set((state) => ({
        elements: state.elements.map((el) => el.id === id ? { ...el, dualSupply: enabled } : el),
      }));
    },

    setSwapDualSupply: (id, swapped) => {
      pushHistory();
      set((state) => ({
        elements: state.elements.map((el) => el.id === id ? { ...el, swapDualSupply: swapped } : el),
      }));
    },

    // ── Undo / Redo ──────────────────────────────────────────────────────────

    undo: () => {
      const { history, elements, pipes, annotations, future } = get();
      if (history.length === 0) return;
      const prev = history[history.length - 1];
      set({
        history: history.slice(0, -1),
        future: [{ elements, pipes, annotations }, ...future.slice(0, MAX_HISTORY - 1)],
        elements: prev.elements,
        pipes: prev.pipes,
        annotations: prev.annotations,
        selectedId: null,
        selectedIds: [],
        selectedPipeIds: [],
        selectedAnnotationIds: [],
      });
    },

    redo: () => {
      const { history, elements, pipes, annotations, future } = get();
      if (future.length === 0) return;
      const next = future[0];
      set({
        future: future.slice(1),
        history: [...history.slice(-(MAX_HISTORY - 1)), { elements, pipes, annotations }],
        elements: next.elements,
        pipes: next.pipes,
        annotations: next.annotations,
        selectedId: null,
        selectedIds: [],
        selectedPipeIds: [],
        selectedAnnotationIds: [],
      });
    },
  };
}, {
  name: 'schematic-canvas',
  version: 1,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    elements:          state.elements,
    pipes:             state.pipes,
    annotations:       state.annotations,
    sourcePressureBar: state.sourcePressureBar,
  }),
  migrate: (_persisted, version) => {
    // Version mismatch (schema changed) — discard saved data and start fresh
    if (version < 1) return {} as CanvasStore;
    return _persisted as CanvasStore;
  },
}));
